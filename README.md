# CueTeds Build

Google Apps Script project managed with [clasp](https://github.com/google/clasp).

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
5. Deploy:
   ```
   clasp deploy
   ```

Source files live in `src/`.
