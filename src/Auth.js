// Authentication, password hashing, and CacheService-backed sessions.

function generateSalt_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function hashPassword_(password, salt) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password + salt,
    Utilities.Charset.UTF_8
  );
  return digest.map(function (byte) {
    var v = (byte < 0 ? byte + 256 : byte).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

// Constant-time string comparison to avoid leaking hash match length via timing.
function safeEquals_(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function sessionCache_() {
  return CacheService.getScriptCache();
}

/**
 * Section 4.3 access resolution, checked on every module load (here: on
 * every login / session resume, since that's what drives the header
 * switcher).
 *   1. SuperUser -> full access to everything, stop.
 *   2. Else, Branch Admin Of (not "None") -> full access to every
 *      branch-split module, stop (company-wide modules are NOT covered by
 *      this meta-grant — see Section 5 / MODULE_BRANCH_SCOPE).
 *   3. Else, look up User Module Access per module -> a row with a Role
 *      means that module is visible.
 *   4. Else, no row found -> module does not appear in the switcher at all.
 *
 * Manage User (ADM) access is SuperUser-only for now — Section 3's "Admin
 * can manage users for that module" (a module-scoped view) isn't built yet.
 */
function getAccessibleModules_(user) {
  var isSuperUser = user['Is SuperUser'] === 'Y';
  if (isSuperUser) {
    return { modules: MODULE_CODES.slice(), canManageUsers: true };
  }

  var branchAdminOf = user['Branch Admin Of'];
  if (branchAdminOf && branchAdminOf !== 'None') {
    var branchModules = MODULE_CODES.filter(function (code) {
      return MODULE_BRANCH_SCOPE[code] === 'branch-split';
    });
    // Company-wide modules still need an explicit per-module grant even for
    // a Branch Admin, so fall through to the User Module Access lookup for
    // those.
    var companyWideCodes = MODULE_CODES.filter(function (code) {
      return MODULE_BRANCH_SCOPE[code] === 'company-wide';
    });
    var accessMap = getUserModuleAccessMap_(user['User ID']);
    var grantedCompanyWide = companyWideCodes.filter(function (code) {
      return accessMap[code] && accessMap[code]['Role'];
    });
    return { modules: branchModules.concat(grantedCompanyWide), canManageUsers: false };
  }

  var moduleAccessMap = getUserModuleAccessMap_(user['User ID']);
  var grantedModules = MODULE_CODES.filter(function (code) {
    return moduleAccessMap[code] && moduleAccessMap[code]['Role'];
  });
  return { modules: grantedModules, canManageUsers: false };
}

function createSession_(user) {
  var token = Utilities.getUuid();
  var access = getAccessibleModules_(user);
  var payload = {
    userId: user['User ID'],
    email: user['Email'],
    fullName: user['Full Name'],
    isSuperUser: user['Is SuperUser'] === 'Y',
    branchAdminOf: user['Branch Admin Of'],
    mustChangePassword: user['Must Change Password'] === 'Y',
    accessibleModules: access.modules,
    canManageUsers: access.canManageUsers
  };
  sessionCache_().put(token, JSON.stringify(payload), CONFIG.SESSION_TTL_SECONDS);
  return { token: token, payload: payload };
}

function readSession_(token) {
  if (!token) return null;
  var raw = sessionCache_().get(token);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeSession_(token, payload) {
  sessionCache_().put(token, JSON.stringify(payload), CONFIG.SESSION_TTL_SECONDS);
}

/**
 * Called from the client on login form submit.
 * Never exposes whether the email exists — only generic failure messages.
 */
function attemptLogin(email, password) {
  var user = findUserByEmail_(email);

  if (!user) {
    return { success: false, message: 'Invalid email or password.' };
  }

  var computedHash = hashPassword_(password, user['Salt']);
  if (!safeEquals_(computedHash, user['Password Hash'])) {
    return { success: false, message: 'Invalid email or password.' };
  }

  if (user['Account Status'] !== 'Active') {
    return { success: false, message: 'This account is inactive. Please contact your administrator.' };
  }

  updateUserFields_(user._rowNumber, { 'Last Login': new Date() });

  var session = createSession_(user);

  return {
    success: true,
    token: session.token,
    mustChangePassword: session.payload.mustChangePassword,
    user: {
      fullName: session.payload.fullName,
      email: session.payload.email,
      isSuperUser: session.payload.isSuperUser,
      branchAdminOf: session.payload.branchAdminOf,
      accessibleModules: session.payload.accessibleModules,
      canManageUsers: session.payload.canManageUsers
    },
    moduleUrls: MODULE_URLS,
    shellVersion: CONFIG.SHELL_VERSION
  };
}

/**
 * Called on page load to silently resume a session stored client-side.
 */
function validateSession(token) {
  var session = readSession_(token);
  if (!session) {
    return { valid: false };
  }
  return {
    valid: true,
    mustChangePassword: session.mustChangePassword,
    user: {
      fullName: session.fullName,
      email: session.email,
      isSuperUser: session.isSuperUser,
      branchAdminOf: session.branchAdminOf,
      accessibleModules: session.accessibleModules,
      canManageUsers: session.canManageUsers
    },
    moduleUrls: MODULE_URLS,
    shellVersion: CONFIG.SHELL_VERSION
  };
}

/**
 * Forced password reset — required before any app access when
 * Must Change Password = Y (new users and password resets).
 */
function changePassword(token, newPassword, confirmPassword) {
  var session = readSession_(token);
  if (!session) {
    return { success: false, message: 'Your session has expired. Please log in again.' };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, message: 'Passwords do not match.' };
  }
  if (String(newPassword).length < CONFIG.MIN_PASSWORD_LENGTH) {
    return { success: false, message: 'Password must be at least ' + CONFIG.MIN_PASSWORD_LENGTH + ' characters.' };
  }

  var user = findUserById_(session.userId);
  if (!user) {
    return { success: false, message: 'User account not found.' };
  }

  var salt = generateSalt_();
  var hash = hashPassword_(newPassword, salt);
  updateUserFields_(user._rowNumber, {
    'Password Hash': hash,
    'Salt': salt,
    'Must Change Password': 'N'
  });

  session.mustChangePassword = false;
  writeSession_(token, session);

  return { success: true };
}

function logout(token) {
  if (token) {
    sessionCache_().remove(token);
  }
  return { success: true };
}
