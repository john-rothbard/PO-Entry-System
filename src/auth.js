// ── Google Identity Services auth wrapper ─────────────────────

let _credential = null;  // raw JWT string
let _user = null;        // { email, name }

// Wait for the GSI library to load (it's async in index.html)
function waitForGoogle() {
  return new Promise((resolve) => {
    if (window.google) { resolve(); return; }
    const interval = setInterval(() => {
      if (window.google) { clearInterval(interval); resolve(); }
    }, 100);
  });
}

function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export async function initGoogleAuth(clientId) {
  await waitForGoogle();
  google.accounts.id.initialize({
    client_id: clientId,
    callback: () => {}, // overridden per sign-in call
    auto_select: false,
  });
}

export function signIn(clientId) {
  return new Promise((resolve, reject) => {
    google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (!response.credential) {
          reject(new Error('Sign-in cancelled or failed'));
          return;
        }
        const payload = decodeJwtPayload(response.credential);
        if (!payload) {
          reject(new Error('Invalid token received'));
          return;
        }
        _credential = response.credential;
        _user = { email: payload.email, name: payload.name };
        resolve({ credential: _credential, ..._user });
      },
      auto_select: false,
    });
    google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // Prompt was suppressed — fall back to rendering a button via a temp div
        reject(new Error('SHOW_BUTTON'));
      }
    });
  });
}

export function signOut() {
  if (_user?.email) {
    google.accounts.id.revoke(_user.email, () => {});
  }
  _credential = null;
  _user = null;
}

export function getCredential() {
  return _credential;
}

export function getUser() {
  return _user;
}

export function isSignedIn() {
  if (!_credential) return false;
  const payload = decodeJwtPayload(_credential);
  if (!payload) return false;
  // Consider signed in if token isn't expired
  return payload.exp * 1000 > Date.now();
}

// Returns true if the token is about to expire (within 60 seconds)
export function isTokenExpiringSoon() {
  if (!_credential) return true;
  const payload = decodeJwtPayload(_credential);
  if (!payload) return true;
  return payload.exp * 1000 < Date.now() + 60_000;
}
