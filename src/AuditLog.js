// Standardized audit log (Section 6 of the spec) — shared schema across
// every module, one sheet in the central Users spreadsheet.

function getAuditLogSheet_() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('USERS_SHEET_ID');
  if (!sheetId) {
    throw new Error('Users database is not set up yet. Run setupUsersDatabase() from the Apps Script editor first.');
  }
  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(AUDIT_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(AUDIT_LOG_SHEET_NAME);
    sheet.getRange(1, 1, 1, AUDIT_LOG_COLUMNS.length).setValues([AUDIT_LOG_COLUMNS]);
    sheet.getRange(1, 1, 1, AUDIT_LOG_COLUMNS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * entry: { user, branch, module, recordRef, action, fieldChanged, oldValue, newValue }
 * `user` is whoever performed the change (the acting admin), not the record
 * being changed.
 */
function writeAuditLog_(entry) {
  var sheet = getAuditLogSheet_();
  var row = [
    new Date(),
    entry.user || '',
    entry.branch || 'N/A',
    entry.module || '',
    entry.recordRef || '',
    entry.action || '',
    entry.fieldChanged || '',
    entry.oldValue === undefined || entry.oldValue === null ? '' : String(entry.oldValue),
    entry.newValue === undefined || entry.newValue === null ? '' : String(entry.newValue)
  ];
  sheet.appendRow(row);
}

// Most recent entries first, capped so the admin UI stays responsive.
function listAuditLog_(limit) {
  var sheet = getAuditLogSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var count = Math.min(limit || 300, lastRow - 1);
  var startRow = lastRow - count + 1;
  var data = sheet.getRange(startRow, 1, count, AUDIT_LOG_COLUMNS.length).getValues();

  var out = data.map(function (row) {
    var entry = {};
    AUDIT_LOG_COLUMNS.forEach(function (col, i) {
      // google.script.run can fail to round-trip a Date object nested inside
      // an array of objects (a bare top-level Date is fine) — stringify it
      // before it crosses the bridge.
      entry[col] = (col === 'Timestamp' && row[i] instanceof Date) ? row[i].toISOString() : row[i];
    });
    return entry;
  });
  out.reverse();
  return out;
}
