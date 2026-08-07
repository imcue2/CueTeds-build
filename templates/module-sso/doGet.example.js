// ============================================================
// doGet.example.js — illustrates how to wire SessionsRepo.js into a
// module's entry point. Not meant to be copied verbatim — adapt the
// HtmlService template names to CM's actual pages.
// ============================================================
//
// Per Section 1 of the rev3 spec: "Clicking a module in the header
// passes that token through; each module's doGet(e) checks for a
// valid incoming token and skips its own login screen if present.
// Missing/invalid token falls back to that module's own login (covers
// someone opening a module's raw URL directly)."
//
// That means CM needs its OWN login screen/flow (its own version of
// the shell's Login.html + Auth.js's attemptLogin) as the fallback —
// this template only covers the SSO hand-off from the shell, not
// building that fallback login screen itself.

function doGet(e) {
  var token = e.parameter.token;
  var session = token ? readSession_(token) : null;

  if (session) {
    // Valid session from the shell — skip CM's own login screen and go
    // straight to the app. session.userId / session.email /
    // session.fullName / session.isSuperUser / session.branchAdminOf /
    // session.accessibleModules / session.canManageUsers are all
    // available here.
    return HtmlService.createTemplateFromFile('App') // CM's real app page
      .evaluate()
      .setTitle('Container Movement');
  }

  // Missing / invalid / expired token — show CM's own login screen,
  // not a redirect back to the shell (the shell doesn't support being
  // a redirect-back target today — see the SessionsRepo.js header
  // note and the conversation this template came out of).
  return HtmlService.createTemplateFromFile('Login') // CM's own login page
    .evaluate()
    .setTitle('Container Movement — Sign In');
}
