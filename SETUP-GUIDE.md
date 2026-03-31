# PO Entry System — Setup Guide

## Architecture

```
Worker's Browser (React form)
    ↓ POST with shared secret
Google Apps Script (free middleware)
    ↓ validates secret
    ↓ logs to Google Sheet
    ↓ forwards to ShipStation API
    ↓ returns success/error
Worker's Browser (shows confirmation)
```

**Cost: $0.** Google Apps Script and Sheets are free.

---

## Step 1: Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com)
2. Create a new blank spreadsheet
3. Name it something like "PO Entry System - Order Log"
4. The script will auto-create tabs (Order Log, Security Log, Error Log) on first use

---

## Step 2: Set Up the Apps Script

1. In your Google Sheet, go to **Extensions → Apps Script**
2. Delete any existing code in `Code.gs`
3. Open the `google-apps-script.js` file from this project
4. Copy the ENTIRE contents and paste it into `Code.gs`
5. **Fill in the 3 config values at the top:**
   - `SHIPSTATION_API_KEY` — from ShipStation → Settings → API Settings
   - `SHIPSTATION_API_SECRET` — same place
   - `APP_SECRET` — see step 3 below
6. Click **Save** (Ctrl/Cmd + S)

---

## Step 3: Generate a Shared Secret

This secret prevents unauthorized people from using your Apps Script endpoint.

**Option A — Use the built-in generator:**
1. In the Apps Script editor, find the `generateSecret` function
2. In the function dropdown at the top, select `generateSecret`
3. Click **Run**
4. Check the **Execution Log** (View → Execution Log) for your secret
5. Copy it

**Option B — Generate one yourself:**
Open your browser console (F12) and run:
```js
crypto.randomUUID()
```
Copy the result.

**Put this secret in TWO places:**
1. In the Apps Script: `CONFIG.APP_SECRET = 'your-secret-here'`
2. In your `.env` file: `VITE_APP_SECRET=your-secret-here`

They MUST match exactly.

---

## Step 4: Deploy the Apps Script

1. In the Apps Script editor, click **Deploy → New Deployment**
2. Click the gear icon next to "Select type" → choose **Web app**
3. Set:
   - **Description:** "PO Entry System v1"
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**
5. If prompted, authorize the script (click through the "unsafe" warnings — it's your own script)
6. **Copy the Web app URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

> **"Anyone" access note:** This sounds scary but it's fine — the shared secret
> prevents unauthorized use. "Anyone" just means "the URL is reachable," not
> "anyone can do anything." Without the secret, all requests get rejected.

---

## Step 5: Configure the React App

1. In the project folder, copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your values:
   ```
   VITE_GAS_URL=https://script.google.com/macros/s/YOUR_ACTUAL_ID/exec
   VITE_APP_SECRET=your-secret-from-step-3
   ```

3. Save the file.

---

## Step 6: Run It

```bash
npm install    # first time only
npm run dev
```

Opens at **http://localhost:3000**. The "Demo Mode" banner should be gone, replaced by "Connected."

Click **Test Connection** in the header to verify everything works.

---

## Step 7: Replace Sample Data

1. Click **Config** in the header
2. Go to the **Retailers** tab — delete samples, add your real retailers with their ShipStation Store IDs
3. Go to **Master SKUs** — delete samples, add your ~100 real SKUs
4. Go to **SKU Aliases** — for each retailer, fill in what they call each product
5. Click **Export** to save a backup of your config

**To find your ShipStation Store IDs:**
1. Click **Config** → look for "Fetch Stores from ShipStation" button
2. Open browser console (F12) to see the store list

---

## Deploying to Netlify

1. Push this project to a GitHub repository
2. Go to [netlify.com](https://netlify.com) → **Add new site → Import an existing project**
3. Connect your GitHub repo
4. Set build settings:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
5. Go to **Site configuration → Environment variables** and add:
   - `VITE_GAS_URL` — your Apps Script deployment URL
   - `VITE_APP_SECRET` — your shared secret
6. Click **Deploy site**
7. Once deployed, copy your Netlify URL (e.g. `https://your-app.netlify.app`)
8. Go back to your Apps Script and add it to `CONFIG.ALLOWED_ORIGINS`:
   ```js
   ALLOWED_ORIGINS: ['https://your-app.netlify.app'],
   ```
9. Redeploy the Apps Script as a new version (Deploy → Manage Deployments → pencil icon → New version)

> This locks the Apps Script so it only accepts requests from your Netlify domain.

---

## Updating the Apps Script

If you need to change the Apps Script code later:

1. Go to your Google Sheet → Extensions → Apps Script
2. Make your changes
3. Go to **Deploy → Manage Deployments**
4. Click the **pencil icon** on your deployment
5. Change version to **New version**
6. Click **Deploy**

> **Important:** You must create a new version for changes to take effect.
> The deployment URL stays the same.

---

## Security Summary

| Layer | Protection |
|-------|-----------|
| Shared secret | Rejects requests without the correct key |
| Rate limiting | Max 30 requests/minute (prevents abuse) |
| Security log | Logs all failed auth attempts to a sheet tab |
| HTTPS only | Google Apps Script only serves over HTTPS |
| Server-side credentials | ShipStation API key lives in Apps Script, never in the browser |
| No public data | The GAS URL returns nothing useful on GET requests |

---

## Troubleshooting

**"Google Apps Script URL not configured"**
→ Check that `.env` has the correct `VITE_GAS_URL` and restart `npm run dev`

**"Unauthorized / Invalid authentication"**
→ The secret in `.env` doesn't match the one in Apps Script. Check both.

**"Connection failed"**
→ ShipStation credentials in Apps Script may be wrong. Double-check API key/secret.

**Changes to Apps Script aren't working**
→ You need to create a new deployment version. See "Updating" section above.

**CORS errors**
→ Make sure you deployed as "Anyone" access. Google handles CORS automatically for deployed web apps.

---

## File Structure

```
po-system-final/
├── google-apps-script.js   ← Paste this into Google Apps Script
├── SETUP-GUIDE.md           ← You're reading this
├── .env.example              ← Copy to .env, fill in values
├── package.json
├── vite.config.js
├── index.html
└── src/
    ├── main.jsx
    ├── App.jsx               ← Main app
    ├── POForm.jsx             ← Order entry form
    ├── AdminPanel.jsx         ← Config management
    ├── components.jsx         ← Shared UI
    ├── api.js                 ← GAS API client
    └── config.js              ← Default sample data
```
