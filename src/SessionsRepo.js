// Access to the "Sessions" sheet in the central Users spreadsheet. Shared
// storage instead of CacheService so any future module (given the same
// Users spreadsheet ID) can independently validate an incoming token —
// CacheService is scoped per Apps Script project and can't cross that
// boundary. See Auth.js for the session payload shape.

function getSessionsSheet_() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('USERS_SHEET_ID');
  if (!sheetId) {
    throw new Error('Users database is not set up yet. Run setupUsersDatabase() from the Apps Script editor first.');
  }
  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(SESSIONS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SESSIONS_SHEET_NAME);
    sheet.getRange(1, 1, 1, SESSIONS_COLUMNS.length).setValues([SESSIONS_COLUMNS]);
    sheet.getRange(1, 1, 1, SESSIONS_COLUMNS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getSessionsColumnMap_(sheet) {
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  header.forEach(function (name, i) {
    map[name] = i + 1;
  });
  return map;
}

// Deletes any row whose Expires At has passed. Called opportunistically
// whenever the sheet is read, per the "cleanup on next read" approach —
// there's no separate scheduled job.
function purgeExpiredSessions_(sheet, colMap) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var now = Date.now();
  // Walk bottom-up so deleting a row never shifts the index of a row we
  // haven't checked yet.
  for (var i = data.length - 1; i >= 0; i--) {
    var expiresAt = data[i][colMap['Expires At'] - 1];
    if (expiresAt instanceof Date && expiresAt.getTime() < now) {
      sheet.deleteRow(i + 2);
    }
  }
}

function createSessionRow_(token, userId, payload, ttlSeconds) {
  var sheet = getSessionsSheet_();
  var colMap = getSessionsColumnMap_(sheet);
  purgeExpiredSessions_(sheet, colMap);

  var now = new Date();
  var row = new Array(SESSIONS_COLUMNS.length);
  row[colMap['Token'] - 1] = token;
  row[colMap['User ID'] - 1] = userId;
  row[colMap['Payload'] - 1] = JSON.stringify(payload);
  row[colMap['Created At'] - 1] = now;
  row[colMap['Expires At'] - 1] = new Date(now.getTime() + ttlSeconds * 1000);
  sheet.appendRow(row);
}

// Returns { rowNumber, token, userId, payload (raw JSON string), createdAt,
// expiresAt }, or null if the token doesn't exist or has expired (an
// expired row is deleted as part of the lookup, not just left for next time).
function findSessionRow_(token) {
  if (!token) return null;

  var sheet = getSessionsSheet_();
  var colMap = getSessionsColumnMap_(sheet);
  purgeExpiredSessions_(sheet, colMap);

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][colMap['Token'] - 1]) === String(token)) {
      return {
        rowNumber: i + 2,
        token: data[i][colMap['Token'] - 1],
        userId: data[i][colMap['User ID'] - 1],
        payload: data[i][colMap['Payload'] - 1],
        createdAt: data[i][colMap['Created At'] - 1],
        expiresAt: data[i][colMap['Expires At'] - 1]
      };
    }
  }
  return null;
}

// Overwrites the payload for an existing session row and, since this is
// also how the app signals "still active," refreshes Expires At by another
// full TTL window from now.
function updateSessionPayloadRow_(rowNumber, payload, ttlSeconds) {
  var sheet = getSessionsSheet_();
  var colMap = getSessionsColumnMap_(sheet);
  sheet.getRange(rowNumber, colMap['Payload']).setValue(JSON.stringify(payload));
  sheet.getRange(rowNumber, colMap['Expires At']).setValue(new Date(Date.now() + ttlSeconds * 1000));
}

function deleteSessionRow_(rowNumber) {
  var sheet = getSessionsSheet_();
  sheet.deleteRow(rowNumber);
}
