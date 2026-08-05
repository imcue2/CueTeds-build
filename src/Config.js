// Shared constants for the BPL Integrated Monitoring shell.

var CONFIG = {
  USERS_SHEET_NAME: 'Users',
  DRIVE_FOLDER_NAME: 'BPL Integrated Monitoring',
  USERS_FILE_NAME: 'BPL Integrated Monitoring — Users',
  SESSION_TTL_SECONDS: 21600, // 6 hours.
  MIN_PASSWORD_LENGTH: 8,
  SEED_SUPERUSER_EMAIL: 'admin@blueplanetlogistics.com',
  COMPANY_EMAIL_DOMAIN: '@blueplanetlogistics.com',
  SHELL_VERSION: '1.0.0'
};

// Column order for the central Users sheet (Section 4.1 of the spec).
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

// Header module switcher order (Section 4.2 of the spec). ADM (Manage User)
// is shell-native, not a separate deployed module, so it isn't listed here.
var MODULE_CODES = ['TRN', 'VIC', 'OSI', 'COC', 'SPC', 'IPM', 'EFT', 'CBM', 'PCF', 'VAA'];

// Filled in as each module is deployed as its own Apps Script web app
// (Section 1: hub-and-spoke). Empty string = not yet connected — the header
// switcher will show a placeholder for that module instead of navigating.
var MODULE_URLS = {
  TRN: '', VIC: '', OSI: '', COC: '', SPC: '', IPM: '', EFT: '', CBM: '', PCF: '', VAA: ''
};

// Branch scoping per module (Section 5). Branch Admin's meta-grant only
// covers branch-split modules — company-wide modules always need an
// explicit per-module grant, even for a Branch Admin.
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
  VAA: 'company-wide'
};

// Section 3 role tiers assignable per module in the access matrix.
// Supervisor is only ever offered for OSI (Section 3.1 lockout rule).
var MODULE_ROLES = ['Admin', 'Supervisor', 'Staff', 'View'];

// Section 3: Branch Admin Of meta-grant values.
var BRANCH_ADMIN_OPTIONS = ['None', 'POM', 'LAE', 'Both'];

// Section 4.2: Branch Scope on a per-module access grant (Staff role).
var BRANCH_SCOPE_OPTIONS = ['POM', 'LAE', 'Both', 'N/A'];

// Section 4.2 — one row per user per module, only needed for access not
// already covered by the SuperUser or Branch Admin blanket grants.
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

// Section 6 — standardized audit log schema, shared by every module.
var AUDIT_LOG_SHEET_NAME = 'Audit Log';
var AUDIT_LOG_COLUMNS = [
  'Timestamp',
  'User',
  'Branch',
  'Module',
  'Record Ref#',
  'Action',
  'Field Changed',
  'Old Value',
  'New Value'
];

// Section 1 (hub-and-spoke): sessions live in a sheet, not CacheService,
// because CacheService is scoped per Apps Script project — a token created
// by the shell couldn't be read by a separately-deployed module. Any future
// module that knows the Users spreadsheet ID can validate an incoming
// token the same way this file does.
var SESSIONS_SHEET_NAME = 'Sessions';
var SESSIONS_COLUMNS = ['Token', 'User ID', 'Payload', 'Created At', 'Expires At'];
