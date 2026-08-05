// Access to the central Users spreadsheet (Section 4.1 of the spec).
// The Users spreadsheet is separate from this shell project — its ID is
// stored in Script Properties under USERS_SHEET_ID once setupUsersDatabase()
// has been run.

function getUsersSheet_() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('USERS_SHEET_ID');
  if (!sheetId) {
    throw new Error('Users database is not set up yet. Run setupUsersDatabase() from the Apps Script editor first.');
  }
  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(CONFIG.USERS_SHEET_NAME);
  if (!sheet) {
    throw new Error('The "' + CONFIG.USERS_SHEET_NAME + '" sheet was not found in the Users spreadsheet.');
  }
  return sheet;
}

// Maps header row -> column index (1-based) so row access doesn't rely on
// hardcoded column numbers.
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

function findUserById_(userId) {
  var sheet = getUsersSheet_();
  var colMap = getUsersColumnMap_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][colMap['User ID'] - 1]) === String(userId)) {
      var user = rowToUser_(data[i], colMap);
      user._rowNumber = i + 2;
      return user;
    }
  }
  return null;
}

function listAllUsers_() {
  var sheet = getUsersSheet_();
  var colMap = getUsersColumnMap_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  return data.map(function (rowValues, i) {
    var user = rowToUser_(rowValues, colMap);
    user._rowNumber = i + 2;
    return user;
  });
}

function countActiveSuperUsers_() {
  return listAllUsers_().filter(function (u) {
    return u['Is SuperUser'] === 'Y' && u['Account Status'] === 'Active';
  }).length;
}

// Section 3.1: blocks deactivating, deleting, or demoting a SuperUser if it
// would leave zero active SuperUsers. Pass the user's CURRENT state and the
// state being applied; returns an error message, or null if the change is safe.
function checkLastSuperUserGuard_(user, changes) {
  var isCurrentlyActiveSuperUser = user['Is SuperUser'] === 'Y' && user['Account Status'] === 'Active';
  if (!isCurrentlyActiveSuperUser) return null;

  var willStillBeSuperUser = ('isSuperUser' in changes) ? changes.isSuperUser : true;
  var willStillBeActive = ('accountStatus' in changes) ? changes.accountStatus === 'Active' : true;
  var willStillCount = willStillBeSuperUser && willStillBeActive;

  if (!willStillCount && countActiveSuperUsers_() <= 1) {
    return 'This is the last active SuperUser — the system must always retain at least one.';
  }
  return null;
}

function deleteUserRow_(rowNumber) {
  var sheet = getUsersSheet_();
  sheet.deleteRow(rowNumber);
}

// Updates specific fields (by column name) on a user's row.
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

function appendUserRow_(user) {
  var sheet = getUsersSheet_();
  var colMap = getUsersColumnMap_(sheet);
  var row = new Array(USERS_COLUMNS.length);
  USERS_COLUMNS.forEach(function (col) {
    row[colMap[col] - 1] = (col in user) ? user[col] : '';
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

// One-time setup: creates the central Users spreadsheet (if not already
// configured), lays out the header row, and seeds an initial active
// SuperUser account so there is a way to log in before Manage User exists.
// Run this manually from the Apps Script editor (Run > setupUsersDatabase).
function setupUsersDatabase() {
  var props = PropertiesService.getScriptProperties();
  var existingId = props.getProperty('USERS_SHEET_ID');
  if (existingId) {
    try {
      var existing = SpreadsheetApp.openById(existingId);
      Logger.log('Users database already set up: ' + existing.getUrl());
      return { alreadySetUp: true, url: existing.getUrl() };
    } catch (e) {
      Logger.log('Stored USERS_SHEET_ID is no longer accessible, recreating: ' + e);
    }
  }

  var ss = SpreadsheetApp.create(CONFIG.USERS_FILE_NAME);
  var sheet = ss.getSheets()[0];
  sheet.setName(CONFIG.USERS_SHEET_NAME);
  sheet.getRange(1, 1, 1, USERS_COLUMNS.length).setValues([USERS_COLUMNS]);
  sheet.getRange(1, 1, 1, USERS_COLUMNS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, USERS_COLUMNS.length);

  moveFileIntoAppFolder_(ss.getId());

  props.setProperty('USERS_SHEET_ID', ss.getId());

  var seed = seedInitialSuperUser_(sheet);

  // Section 4.2 / 6 — lay out the access matrix, audit log, and sessions
  // sheets now so Manage User and login have somewhere to write from the start.
  getModuleAccessSheet_();
  getAuditLogSheet_();
  getSessionsSheet_();

  Logger.log('Users database created: ' + ss.getUrl());
  Logger.log('Seed SuperUser email: ' + seed.email);
  Logger.log('Seed SuperUser temporary password: ' + seed.tempPassword);
  Logger.log('This password is single-use — the seed account is flagged Must Change Password = Y.');

  return {
    alreadySetUp: false,
    url: ss.getUrl(),
    seedEmail: seed.email,
    seedTempPassword: seed.tempPassword
  };
}

function seedInitialSuperUser_(sheet) {
  var colMap = getUsersColumnMap_(sheet);
  var tempPassword = generateTempPassword_();
  var salt = generateSalt_();
  var now = new Date();

  var user = {};
  user['User ID'] = Utilities.getUuid();
  user['Full Name'] = 'Initial SuperUser';
  user['Email'] = CONFIG.SEED_SUPERUSER_EMAIL;
  user['Password Hash'] = hashPassword_(tempPassword, salt);
  user['Salt'] = salt;
  user['Must Change Password'] = 'Y';
  user['Account Status'] = 'Active';
  user['Is SuperUser'] = 'Y';
  user['Branch Admin Of'] = 'None';
  user['Created Date'] = now;
  user['Created By'] = 'setupUsersDatabase()';
  user['Last Login'] = '';

  appendUserRow_(user);

  return { email: CONFIG.SEED_SUPERUSER_EMAIL, tempPassword: tempPassword };
}

function moveFileIntoAppFolder_(fileId) {
  var file = DriveApp.getFileById(fileId);
  var folders = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER_NAME);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(CONFIG.DRIVE_FOLDER_NAME);
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
}

function generateTempPassword_() {
  // Human-typeable single-use temp password, e.g. "BPL-7F3K9QRT".
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
  var out = '';
  for (var i = 0; i < 10; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'BPL-' + out;
}
