// ============================================================
// Config.template.js — constants needed by Auth.template.js,
// UsersRepo.template.js, and ModuleAccessRepo.template.js.
// ============================================================
//
// These sheet/column names MUST match the shell's real Config.js
// exactly (they're how the lookups find the right columns) — copy
// verbatim, don't retype. If the shell's Config.js ever changes these
// names, every module holding a copy goes stale silently (a lookup
// just returns nothing instead of erroring) — worth a quick diff
// against the shell's Config.js if login/access ever behaves oddly.

var CONFIG = {
  USERS_SHEET_NAME: 'Users',
  SESSION_TTL_SECONDS: 21600 // 6 hours — must match the shell's value.
};

var USERS_COLUMNS = [
  'User ID',
  'Full Name',
  'Email',
  'Password Hash',
  'Salt',
  'Must Change Password',
  'Account Status',
  'Is SuperUser',
  'Branch Admin Of',
  'Created Date',
  'Created By',
  'Last Login'
];

// Full module code list, needed by getAccessibleModules_ to compute
// which modules a user can see. Add CM's own code here once this file
// lives in the CM project (it's already implied by MODULE_BRANCH_SCOPE
// below, but getAccessibleModules_ iterates MODULE_CODES).
var MODULE_CODES = ['TRN', 'VIC', 'OSI', 'COC', 'SPC', 'IPM', 'EFT', 'CBM', 'PCF', 'VAA', 'CM'];

var MODULE_BRANCH_SCOPE = {
  TRN: 'branch-split',
  VIC: 'branch-split',
  OSI: 'branch-split',
  COC: 'branch-split',
  SPC: 'company-wide',
  IPM: 'branch-split',
  EFT: 'branch-split',
  CBM: 'branch-split',
  PCF: 'branch-split',
  VAA: 'company-wide',
  CM: 'branch-split'
};

var MODULE_ACCESS_SHEET_NAME = 'User Module Access';
var MODULE_ACCESS_COLUMNS = [
  'User ID',
  'Module Code',
  'Role',
  'Branch Scope',
  'Tab Scope',
  'Dashboard Scope',
  'Granted Date',
  'Granted By'
];
