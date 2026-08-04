// Shared constants for the BPL Integrated Monitoring shell.

var CONFIG = {
  USERS_SHEET_NAME: 'Users',
  DRIVE_FOLDER_NAME: 'BPL Integrated Monitoring',
  USERS_FILE_NAME: 'BPL Integrated Monitoring — Users',
  SESSION_TTL_SECONDS: 21600, // 6 hours — CacheService's maximum TTL.
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
