// Manage User (ADM) server functions. Every function re-validates the
// session and canManageUsers server-side — the client hiding the ADM tab
// for non-admins is a UX nicety, not the access control.

function requireAdminSession_(token) {
  var session = readSession_(token);
  if (!session || !session.canManageUsers) return null;
  return session;
}

function actingUserLabel_(session) {
  return session.fullName + ' <' + session.email + '>';
}

// google.script.run can fail to round-trip a Date object nested inside an
// array of objects (unlike a bare top-level Date, which is fine) — the RPC
// resolves with a null result on the client instead of the real payload.
// Stringify dates before they cross the bridge.
function dateToString_(val) {
  if (!val) return '';
  var d = (val instanceof Date) ? val : new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toISOString();
}

function publicUser_(user) {
  return {
    userId: user['User ID'],
    fullName: user['Full Name'],
    email: user['Email'],
    accountStatus: user['Account Status'],
    isSuperUser: user['Is SuperUser'] === 'Y',
    branchAdminOf: user['Branch Admin Of'],
    mustChangePassword: user['Must Change Password'] === 'Y',
    createdDate: dateToString_(user['Created Date']),
    lastLogin: dateToString_(user['Last Login'])
  };
}

function adminListUsers(token) {
  var session = requireAdminSession_(token);
  if (!session) return { success: false, message: 'Not authorized.' };

  var users = listAllUsers_().map(publicUser_);
  return { success: true, users: users };
}

function adminCreateUser(token, fullName, email) {
  var session = requireAdminSession_(token);
  if (!session) return { success: false, message: 'Not authorized.' };

  fullName = String(fullName || '').trim();
  email = String(email || '').trim().toLowerCase();

  if (!fullName) return { success: false, message: 'Full name is required.' };
  if (!email || email.indexOf(CONFIG.COMPANY_EMAIL_DOMAIN) === -1) {
    return { success: false, message: 'Email must be a ' + CONFIG.COMPANY_EMAIL_DOMAIN + ' address.' };
  }
  if (findUserByEmail_(email)) {
    return { success: false, message: 'A user with that email already exists.' };
  }

  var tempPassword = generateTempPassword_();
  var salt = generateSalt_();
  var newUser = {
    'User ID': Utilities.getUuid(),
    'Full Name': fullName,
    'Email': email,
    'Password Hash': hashPassword_(tempPassword, salt),
    'Salt': salt,
    'Must Change Password': 'Y',
    'Account Status': 'Active',
    'Is SuperUser': 'N',
    'Branch Admin Of': 'None',
    'Created Date': new Date(),
    'Created By': session.email,
    'Last Login': ''
  };
  appendUserRow_(newUser);

  writeAuditLog_({
    user: actingUserLabel_(session),
    module: 'ADM',
    recordRef: email,
    action: 'Create',
    fieldChanged: 'User Record',
    oldValue: '',
    newValue: fullName + ' <' + email + '>'
  });

  return { success: true, user: publicUser_(newUser), tempPassword: tempPassword };
}

function adminSetSuperUser(token, userId, isSuperUser) {
  var session = requireAdminSession_(token);
  if (!session) return { success: false, message: 'Not authorized.' };

  var user = findUserById_(userId);
  if (!user) return { success: false, message: 'User not found.' };

  var guardMessage = checkLastSuperUserGuard_(user, { isSuperUser: !!isSuperUser });
  if (guardMessage) return { success: false, message: guardMessage };

  var oldValue = user['Is SuperUser'];
  var newValue = isSuperUser ? 'Y' : 'N';
  updateUserFields_(user._rowNumber, { 'Is SuperUser': newValue });

  writeAuditLog_({
    user: actingUserLabel_(session),
    module: 'ADM',
    recordRef: user['Email'],
    action: 'Update',
    fieldChanged: 'Is SuperUser',
    oldValue: oldValue,
    newValue: newValue
  });

  return { success: true };
}

function adminSetBranchAdmin(token, userId, branchAdminOf) {
  var session = requireAdminSession_(token);
  if (!session) return { success: false, message: 'Not authorized.' };

  if (BRANCH_ADMIN_OPTIONS.indexOf(branchAdminOf) === -1) {
    return { success: false, message: 'Invalid Branch Admin value.' };
  }

  var user = findUserById_(userId);
  if (!user) return { success: false, message: 'User not found.' };

  var oldValue = user['Branch Admin Of'];
  updateUserFields_(user._rowNumber, { 'Branch Admin Of': branchAdminOf });

  writeAuditLog_({
    user: actingUserLabel_(session),
    module: 'ADM',
    recordRef: user['Email'],
    action: 'Update',
    fieldChanged: 'Branch Admin Of',
    oldValue: oldValue,
    newValue: branchAdminOf
  });

  return { success: true };
}

function adminSetAccountStatus(token, userId, accountStatus) {
  var session = requireAdminSession_(token);
  if (!session) return { success: false, message: 'Not authorized.' };

  if (accountStatus !== 'Active' && accountStatus !== 'Inactive') {
    return { success: false, message: 'Invalid Account Status value.' };
  }

  var user = findUserById_(userId);
  if (!user) return { success: false, message: 'User not found.' };

  var guardMessage = checkLastSuperUserGuard_(user, { accountStatus: accountStatus });
  if (guardMessage) return { success: false, message: guardMessage };

  var oldValue = user['Account Status'];
  updateUserFields_(user._rowNumber, { 'Account Status': accountStatus });

  writeAuditLog_({
    user: actingUserLabel_(session),
    module: 'ADM',
    recordRef: user['Email'],
    action: 'Status Change',
    fieldChanged: 'Account Status',
    oldValue: oldValue,
    newValue: accountStatus
  });

  return { success: true };
}

function adminDeleteUser(token, userId) {
  var session = requireAdminSession_(token);
  if (!session) return { success: false, message: 'Not authorized.' };

  var user = findUserById_(userId);
  if (!user) return { success: false, message: 'User not found.' };

  var guardMessage = checkLastSuperUserGuard_(user, { isSuperUser: false, accountStatus: 'Inactive' });
  if (guardMessage) return { success: false, message: guardMessage };

  deleteAllModuleAccessForUser_(userId);
  deleteUserRow_(user._rowNumber);

  writeAuditLog_({
    user: actingUserLabel_(session),
    module: 'ADM',
    recordRef: user['Email'],
    action: 'Void-Cancel',
    fieldChanged: 'User Record',
    oldValue: user['Full Name'] + ' <' + user['Email'] + '>',
    newValue: 'Deleted'
  });

  return { success: true };
}

// Effective per-module access grid for one user: which modules are locked
// to Full Access by a meta-grant (Section 4.3 rules 1-2) vs. individually
// granted (rule 3, editable here).
function adminGetUserModuleAccess(token, userId) {
  var session = requireAdminSession_(token);
  if (!session) return { success: false, message: 'Not authorized.' };

  var user = findUserById_(userId);
  if (!user) return { success: false, message: 'User not found.' };

  var isSuperUser = user['Is SuperUser'] === 'Y';
  var branchAdminOf = user['Branch Admin Of'];
  var isBranchAdmin = !!branchAdminOf && branchAdminOf !== 'None';
  var accessMap = getUserModuleAccessMap_(userId);

  var grid = MODULE_CODES.map(function (code) {
    var lockedBySuperUser = isSuperUser;
    var lockedByBranchAdmin = !lockedBySuperUser && isBranchAdmin && MODULE_BRANCH_SCOPE[code] === 'branch-split';
    var locked = lockedBySuperUser || lockedByBranchAdmin;
    var lockReason = lockedBySuperUser ? 'SuperUser' : (lockedByBranchAdmin ? ('Branch Admin — ' + branchAdminOf) : null);
    var existing = accessMap[code];

    return {
      code: code,
      branchScopeType: MODULE_BRANCH_SCOPE[code],
      locked: locked,
      lockReason: lockReason,
      role: locked ? '' : (existing ? existing['Role'] : ''),
      branchScope: locked ? '' : (existing ? existing['Branch Scope'] : ''),
      tabScope: locked ? '' : (existing ? existing['Tab Scope'] : ''),
      dashboardScope: locked ? '' : (existing ? existing['Dashboard Scope'] : '')
    };
  });

  return { success: true, grid: grid };
}

function adminSetModuleAccess(token, userId, moduleCode, fields) {
  var session = requireAdminSession_(token);
  if (!session) return { success: false, message: 'Not authorized.' };

  if (MODULE_CODES.indexOf(moduleCode) === -1) {
    return { success: false, message: 'Unknown module code.' };
  }

  var user = findUserById_(userId);
  if (!user) return { success: false, message: 'User not found.' };

  var isSuperUser = user['Is SuperUser'] === 'Y';
  var branchAdminOf = user['Branch Admin Of'];
  var isBranchAdmin = !!branchAdminOf && branchAdminOf !== 'None';
  var lockedByMetaGrant = isSuperUser || (isBranchAdmin && MODULE_BRANCH_SCOPE[moduleCode] === 'branch-split');
  if (lockedByMetaGrant) {
    return { success: false, message: 'This module is already covered by a SuperUser or Branch Admin grant for this user.' };
  }

  var role = fields && fields.role ? String(fields.role) : '';
  if (role && MODULE_ROLES.indexOf(role) === -1) {
    return { success: false, message: 'Invalid role.' };
  }
  if (role === 'Supervisor' && moduleCode !== 'OSI') {
    return { success: false, message: 'Supervisor is only selectable for Office Stock Inventory Monitoring (OSI).' };
  }

  var accessMap = getUserModuleAccessMap_(userId);
  var old = accessMap[moduleCode] || null;
  var oldRole = old ? old['Role'] : '';
  var oldScope = describeModuleScope_(old ? old['Branch Scope'] : '', old ? old['Tab Scope'] : '', old ? old['Dashboard Scope'] : '');

  var newBranchScope = (fields && fields.branchScope) || 'N/A';
  var newTabScope = (fields && fields.tabScope) || '';
  var newDashScope = (fields && fields.dashboardScope) || '';
  var newScope = describeModuleScope_(newBranchScope, newTabScope, newDashScope);

  upsertModuleAccess_(userId, moduleCode, {
    role: role,
    branchScope: newBranchScope,
    tabScope: newTabScope,
    dashboardScope: newDashScope
  }, session.email);

  var roleChanged = oldRole !== role;
  var scopeChanged = oldScope !== newScope;

  if (roleChanged) {
    var action = !oldRole && role ? 'Create' : (!role ? 'Void-Cancel' : 'Update');
    writeAuditLog_({
      user: actingUserLabel_(session),
      branch: newBranchScope,
      module: moduleCode,
      recordRef: user['Email'],
      action: action,
      fieldChanged: 'Module Access Role',
      oldValue: oldRole || '(none)',
      newValue: role || '(none)'
    });
  } else if (scopeChanged && role) {
    writeAuditLog_({
      user: actingUserLabel_(session),
      branch: newBranchScope,
      module: moduleCode,
      recordRef: user['Email'],
      action: 'Update',
      fieldChanged: 'Module Access Scope',
      oldValue: oldScope,
      newValue: newScope
    });
  }
  // Neither role nor scope actually changed (e.g. a field blurred without
  // edits) — nothing to log.

  return { success: true };
}

function describeModuleScope_(branchScope, tabScope, dashboardScope) {
  return 'Branch: ' + (branchScope || 'N/A') +
    ', Tabs: ' + (tabScope || 'all') +
    ', Dashboards: ' + (dashboardScope || 'all');
}

function adminListAuditLog(token) {
  var session = requireAdminSession_(token);
  if (!session) return { success: false, message: 'Not authorized.' };

  return { success: true, entries: listAuditLog_(300) };
}
