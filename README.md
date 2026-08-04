# CueTeds Build — BPL Integrated Monitoring

Google Apps Script web app for Blue Planet Logistics' Integrated Monitoring
shell, managed with [clasp](https://github.com/google/clasp).

The app currently provides:

- Email/password login backed by a central "Users" Google Sheet
  (`UsersRepo.js`), with salted SHA-256 password hashes (`Auth.js`).
- Forced password reset on first login / after an admin reset
  (`Must Change Password`).
- `CacheService`-backed sessions (6 hour TTL) with client-side session
  token persistence, so a page refresh stays logged in and logout clears
  the session both client- and server-side.
- A placeholder post-login shell (header, user chip, sidebar) that the
  next modules will be built into.

## Setup

Install clasp globally:

```
npm install -g @google/clasp
```

Or install it as a project dev dependency:

```
npm install
```

## Usage

1. Log in to your Google account:
   ```
   clasp login
   ```
2. Copy `.clasp.json.example` to `.clasp.json` and fill in your Apps Script `scriptId`
   (create a project at https://script.google.com or run `clasp create`).
3. Push local source to Apps Script:
   ```
   clasp push
   ```
4. Pull remote changes:
   ```
   clasp pull
   ```
5. From the Apps Script editor, run `setupUsersDatabase()` once (see
   `UsersRepo.js`) to create the central Users spreadsheet and seed an
   initial SuperUser account with a single-use temporary password.
6. Deploy as a web app:
   ```
   clasp deploy
   ```

## Source layout

- `Code.js` — `doGet` entry point and HTML include helper.
- `Config.js` — shared constants and the Users sheet column schema.
- `Auth.js` — password hashing, session create/read/write, login/logout,
  and forced password change.
- `UsersRepo.js` — reads/writes the central Users sheet, including the
  one-time `setupUsersDatabase()` seed routine.
- `Index.html` / `Stylesheet.html` / `ClientJS.html` — the login, forced
  password change, and shell screens.
