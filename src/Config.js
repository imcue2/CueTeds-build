// Shared constants for the BPL Integrated Monitoring shell.

var CONFIG = {
  USERS_SHEET_NAME: 'Users',
  DRIVE_FOLDER_NAME: 'BPL Integrated Monitoring',
  USERS_FILE_NAME: 'BPL Integrated Monitoring — Users',
  SESSION_TTL_SECONDS: 21600, // 6 hours — CacheService's maximum TTL.
  MIN_PASSWORD_LENGTH: 8,
  SEED_SUPERUSER_EMAIL: 'admin@blueplanetlogistics.com',
  COMPANY_EMAIL_DOMAIN: '@blueplanetlogistics.com'
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
