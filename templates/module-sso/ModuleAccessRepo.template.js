// ============================================================
// ModuleAccessRepo.template.js — subset of the shell's
// ModuleAccessRepo.js needed by getAccessibleModules_ (see
// Auth.template.js) to compute which modules a freshly-logged-in
// user can see. Copy verbatim. Depends on Config.template.js.
// ============================================================

function getModuleAccessSheet_() {
  var ss = SpreadsheetApp.openById(USERS_SHEET_ID);
  var sheet = ss.getSheetByName(MODULE_ACCESS_SHEET_NAME);
  if (!sheet) {
    // Matches the shell's own behavior: lazily create it if this is
    // somehow the first thing to touch it. Requires Editor access.
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
  access._rowNumber = null;
  return access;
}

// Returns { TRN: {row...}, VIC: {row...}, ... } for whichever modules
// this user has an explicit grant row for.
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
