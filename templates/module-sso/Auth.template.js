// ============================================================
// Auth.template.js — password verification + session creation, taken
// from the shell's real Auth.js. Copy verbatim. Depends on
// Config.template.js, UsersRepo.template.js, ModuleAccessRepo.template.js,
// and SessionsRepo.js (all in this same folder).
// ============================================================
//
// IMPORTANT GAP — read before wiring this into a login form:
// attemptLogin() below returns mustChangePassword: true/false in its
// response, exactly like the shell's does. The shell's client checks
// that flag and blocks all app access behind a mandatory "set new
// password" screen until it's cleared (Section 2 of the rev3 spec:
// every new user / password reset must change their password before
// any app access — the temp password is single-use). This template
// does NOT include that force-password-change screen or the
// changePassword() function that clears the flag — CM's login UI
// needs to check mustChangePassword itself and gate on it, or you
// end up letting someone into CM on a temporary password that was
// only ever meant to work once. Ask for the changePassword() template
// too if you want it — it's a similar-sized chunk (password hashing +
// a session payload rewrite) that wasn't part of this request.

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
    mustChangePassword: session.payload.mustChangePassword, // see the gap noted at the top of this file
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
