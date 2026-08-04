// Access to the "User Module Access" sheet (Section 4.2 of the spec) — one
// row per user per module, only needed for access not already covered by
// the SuperUser or Branch Admin blanket grants.

function getModuleAccessSheet_() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('USERS_SHEET_ID');
  if (!sheetId) {
    throw new Error('Users database is not set up yet. Run setupUsersDatabase() from the Apps Script editor first.');
  }
  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(MODULE_ACCESS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MODULE_ACCESS_SHEET_NAME);
    sheet.getRange(1, 1, 1, MODULE_ACCESS_COLUMNS.length).setValues([MODULE_ACCESS_COLUMNS]);
    sheet.getRange(1, 1, 1, MODULE_ACCESS_COLUMNS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getModuleAccessColumnMap_(sheet) {
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  header.forEach(function (name, i) {
    map[name] = i + 1;
  });
  return map;
}

function rowToModuleAccess_(rowValues, colMap) {
  var access = {};
  MODULE_ACCESS_COLUMNS.forEach(function (col) {
    access[col] = rowValues[colMap[col] - 1];
  });
  access._rowNumber = null; // set by caller
  return access;
}

// Returns { TRN: {row...}, VIC: {row...}, ... } for whichever modules this
// user has an explicit grant row for.
function getUserModuleAccessMap_(userId) {
  var sheet = getModuleAccessSheet_();
  var colMap = getModuleAccessColumnMap_(sheet);
  var lastRow = sheet.getLastRow();
  var map = {};
  if (lastRow < 2) return map;

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][colMap['User ID'] - 1]) === String(userId)) {
      var access = rowToModuleAccess_(data[i], colMap);
      access._rowNumber = i + 2;
      map[access['Module Code']] = access;
    }
  }
  return map;
}

// Creates or updates the single (userId, moduleCode) row. Passing a blank/
// falsy role removes the grant entirely (used when an admin clears a role
// back to "no access").
function upsertModuleAccess_(userId, moduleCode, fields, grantedBy) {
  var sheet = getModuleAccessSheet_();
  var colMap = getModuleAccessColumnMap_(sheet);
  var lastRow = sheet.getLastRow();
  var existingRow = null;

  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][colMap['User ID'] - 1]) === String(userId) &&
          String(data[i][colMap['Module Code'] - 1]) === String(moduleCode)) {
        existingRow = i + 2;
        break;
      }
    }
  }

  if (!fields.role) {
    if (existingRow) sheet.deleteRow(existingRow);
    return null;
  }

  var record = {
    'User ID': userId,
    'Module Code': moduleCode,
    'Role': fields.role,
    'Branch Scope': fields.branchScope || 'N/A',
    'Tab Scope': fields.tabScope || '',
    'Dashboard Scope': fields.dashboardScope || '',
    'Granted Date': new Date(),
    'Granted By': grantedBy
  };

  if (existingRow) {
    MODULE_ACCESS_COLUMNS.forEach(function (col) {
      sheet.getRange(existingRow, colMap[col]).setValue(record[col]);
    });
  } else {
    var row = new Array(MODULE_ACCESS_COLUMNS.length);
    MODULE_ACCESS_COLUMNS.forEach(function (col) {
      row[colMap[col] - 1] = record[col];
    });
    sheet.appendRow(row);
  }
  return record;
}

// Removes every grant row for a user — used when a user is deleted.
function deleteAllModuleAccessForUser_(userId) {
  var sheet = getModuleAccessSheet_();
  var colMap = getModuleAccessColumnMap_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  for (var row = lastRow; row >= 2; row--) {
    var rowUserId = sheet.getRange(row, colMap['User ID']).getValue();
    if (String(rowUserId) === String(userId)) {
      sheet.deleteRow(row);
    }
  }
}
