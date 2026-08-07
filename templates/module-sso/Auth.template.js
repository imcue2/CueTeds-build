// ============================================================
// Auth.template.js — password verification, session creation, and
// forced password change, taken from the shell's real Auth.js. Copy
// verbatim. Depends on Config.template.js, UsersRepo.template.js,
// ModuleAccessRepo.template.js, and SessionsRepo.js (all in this same
// folder).
// ============================================================
//
// REMAINING GAP — this file gives you the two server-side functions
// (attemptLogin, changePassword). It does NOT include the actual
// login/change-password FORM HTML or client-side JS (same scoping as
// doGet.example.js, which also only shows routing, not the page
// markup). CM's login screen still has to:
//   1. Call attemptLogin(email, password) on submit.
//   2. If the response has mustChangePassword: true, show a "set new
//      password" screen INSTEAD of the app — same as the shell does —
//      and call changePassword(token, newPassword, confirmPassword)
//      from that screen before letting the user any further in.
//   3. Only render CM's real app once mustChangePassword is false.
// Skipping step 2 is exactly the "mustChangePassword silently ignored"
// gap this file was written to close — the server-side enforcement
// only works if the client actually branches on the flag.

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

// Section 4.3 access resolution — identical logic to the shell's own
// Auth.js, so a user sees the same set of modules whether they logged
// in through the shell or through CM's fallback screen.
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
  createSessionRow_(token, user['User ID'], payload, CONFIG.SESSION_TTL_SECONDS);
  return { token: token, payload: payload };
}

// Rewrites an already-issued session's payload in place (used by
// changePassword below to flip mustChangePassword to false without
// forcing a fresh login).
function writeSession_(token, payload) {
  var row = findSessionRow_(token);
  if (!row) return;
  updateSessionPayloadRow_(row.rowNumber, payload, CONFIG.SESSION_TTL_SECONDS);
}

/**
 * Call this from CM's own login form submit handler. Never exposes
 * whether the email exists — only generic failure messages, same as
 * the shell.
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
    // CM's login UI must branch on this — see the note at the top of
    // this file. true means: show the force-password-change screen
    // and call changePassword() below, not CM's real app yet.
    mustChangePassword: session.payload.mustChangePassword,
    user: {
      fullName: session.payload.fullName,
      email: session.payload.email,
      isSuperUser: session.payload.isSuperUser,
      branchAdminOf: session.payload.branchAdminOf,
      accessibleModules: session.payload.accessibleModules,
      canManageUsers: session.payload.canManageUsers
    }
  };
}

/**
 * Call this from CM's own force-password-change screen — the one
 * shown instead of the app when attemptLogin returned
 * mustChangePassword: true (new users and password resets; the temp
 * password is single-use). Clears the flag both on the Users row and
 * on the already-issued session, so the caller can proceed straight
 * into CM's app afterward without logging in again.
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
