// ============================================================
// SessionsRepo.js — SSO template for BPL Integrated Monitoring modules
// (Section 1: hub-and-spoke). Copy this file verbatim into the CM
// Apps Script project (or any future module's project).
// ============================================================
//
// Lets a module validate a session token issued by the shell without
// CacheService, which is scoped per Apps Script project and can't be
// read across separate deployments. Sessions live in a "Sessions"
// sheet in the shell's central Users spreadsheet:
//   Token | User ID | Payload | Created At | Expires At
//
// This is the same code the shell itself uses (Auth.js's readSession_
// + SessionsRepo.js's findSessionRow_) — copied so a second, separate
// Apps Script project can read the same sheet.
//
// Before this works:
//   1. Set USERS_SHEET_ID below to the shell's Users spreadsheet ID.
//      Get it from the SHELL project's Apps Script editor -> Project
//      Settings -> Script Properties -> USERS_SHEET_ID, or by opening
//      the "BPL Integrated Monitoring — Users" spreadsheet directly
//      (Drive folder "BPL Integrated Monitoring") and copying the ID
//      out of its URL.
//   2. Share that spreadsheet with the Google account CM deploys as
//      (its "Execute as" identity — should match the shell's own
//      executeAs: USER_DEPLOYING in appsscript.json). EDITOR access is
//      required — this file both reads and writes the Sessions sheet
//      (createSessionRow_ below), and if CM's own login also reads the
//      Users sheet's password hashes (see Auth.template.js), that's
//      read access on Users too. Viewer-only would only be enough for
//      a module that never creates its own sessions (pure token
//      hand-off validation, no fallback login). Without the share,
//      SpreadsheetApp.openById() below will throw a permission error
//      at runtime.

var USERS_SHEET_ID = 'PASTE_SHELL_USERS_SPREADSHEET_ID_HERE';
var SESSIONS_SHEET_NAME = 'Sessions';
var SESSIONS_COLUMNS = ['Token', 'User ID', 'Payload', 'Created At', 'Expires At'];

function getSessionsSheet_() {
  var ss = SpreadsheetApp.openById(USERS_SHEET_ID);
  var sheet = ss.getSheetByName(SESSIONS_SHEET_NAME);
  if (!sheet) {
    throw new Error('Sessions sheet not found — confirm USERS_SHEET_ID points at the shell\'s Users spreadsheet.');
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

// Opportunistic housekeeping — deletes any row whose Expires At has
// passed, same as the shell does on its own reads. Requires Editor
// access on the spreadsheet. Delete this function and its call below
// if this module should only ever need read access.
function purgeExpiredSessions_(sheet, colMap) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var now = Date.now();
  for (var i = data.length - 1; i >= 0; i--) {
    var expiresAt = data[i][colMap['Expires At'] - 1];
    if (expiresAt instanceof Date && expiresAt.getTime() < now) {
      sheet.deleteRow(i + 2);
    }
  }
}

// Returns { rowNumber, token, userId, payload (raw JSON string),
// createdAt, expiresAt }, or null if the token doesn't exist or has
// expired (an expired row is excluded because purge deletes it before
// the scan below runs).
function findSessionRow_(token) {
  if (!token) return null;

  var sheet = getSessionsSheet_();
  var colMap = getSessionsColumnMap_(sheet);
  purgeExpiredSessions_(sheet, colMap); // remove if this module stays read-only

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

// Convenience wrapper — parses the Payload JSON for you. Returns null
// on missing/invalid/expired token, or a malformed payload.
//
// Shape of the parsed object (see the shell's Auth.js createSession_):
//   {
//     userId, email, fullName,
//     isSuperUser, branchAdminOf, mustChangePassword,
//     accessibleModules, canManageUsers
//   }
function readSession_(token) {
  var row = findSessionRow_(token);
  if (!row) return null;
  try {
    return JSON.parse(row.payload);
  } catch (e) {
    return null;
  }
}

// Writes a new session row — this is how CM's OWN fallback login (see
// Auth.template.js's attemptLogin) produces a token that the shell and
// every other module recognizes, instead of a disconnected local login.
// ttlSeconds should match the shell's CONFIG.SESSION_TTL_SECONDS
// (21600 = 6 hours) so session lifetime behaves the same everywhere.
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

// Overwrites the payload for an existing session row and refreshes
// Expires At by another full TTL window from now. Used by
// changePassword (Auth.template.js) to flip mustChangePassword to
// false in the already-issued session, so the client doesn't have to
// log in again just because it changed its password.
function updateSessionPayloadRow_(rowNumber, payload, ttlSeconds) {
  var sheet = getSessionsSheet_();
  var colMap = getSessionsColumnMap_(sheet);
  sheet.getRange(rowNumber, colMap['Payload']).setValue(JSON.stringify(payload));
  sheet.getRange(rowNumber, colMap['Expires At']).setValue(new Date(Date.now() + ttlSeconds * 1000));
}
