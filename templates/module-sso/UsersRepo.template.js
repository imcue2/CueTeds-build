// ============================================================
// UsersRepo.template.js — subset of the shell's UsersRepo.js needed
// for CM's own fallback login (email lookup + Last Login update).
// Copy verbatim. Depends on Config.template.js and the USERS_SHEET_ID
// constant declared in SessionsRepo.js.
// ============================================================

function getUsersSheet_() {
  var ss = SpreadsheetApp.openById(USERS_SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.USERS_SHEET_NAME);
  if (!sheet) {
    throw new Error('The "' + CONFIG.USERS_SHEET_NAME + '" sheet was not found in the Users spreadsheet.');
  }
  return sheet;
}

function getUsersColumnMap_(sheet) {
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  header.forEach(function (name, i) {
    map[name] = i + 1;
  });
  return map;
}

function rowToUser_(rowValues, colMap) {
  var user = {};
  USERS_COLUMNS.forEach(function (col) {
    user[col] = rowValues[colMap[col] - 1];
  });
  user._rowNumber = null; // set by caller
  return user;
}

function findUserByEmail_(email) {
  var normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  var sheet = getUsersSheet_();
  var colMap = getUsersColumnMap_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    var rowEmail = String(data[i][colMap['Email'] - 1] || '').trim().toLowerCase();
    if (rowEmail === normalized) {
      var user = rowToUser_(data[i], colMap);
      user._rowNumber = i + 2;
      return user;
    }
  }
  return null;
}

// Used by attemptLogin to stamp Last Login. Also usable if CM later
// needs to update any other Users column (e.g. its own
// Must-Change-Password flow, if you build one — see the note in
// Auth.template.js about that gap).
function updateUserFields_(rowNumber, fields) {
  var sheet = getUsersSheet_();
  var colMap = getUsersColumnMap_(sheet);
  Object.keys(fields).forEach(function (col) {
    if (!colMap[col]) {
      throw new Error('Unknown Users column: ' + col);
    }
    sheet.getRange(rowNumber, colMap[col]).setValue(fields[col]);
  });
}
