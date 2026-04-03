// ── Google Identity Services auth wrapper ─────────────────────

let _credential = null;  // raw JWT string
let _user = null;        // { email, name }
let _refreshTimer = null;

function persistSession() {
  if (_credential && _user) {
    sessionStorage.setItem('po_auth', JSON.stringify({ credential: _credential, user: _user }));
  }
}

function clearSession() {
  sessionStorage.removeItem('po_auth');
}

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

// Initialize GSI once with a credential callback.
// onCredential is called whenever Google returns a token (button click or auto-select).
let _onCredential = null;

export async function initGoogleAuth(clientId, onCredential) {
  _onCredential = onCredential || null;
  await waitForGoogle();
  google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => {
      if (!response.credential) return;
      const payload = decodeJwtPayload(response.credential);
      if (!payload) return;
      _credential = response.credential;
      _user = { email: payload.email, name: payload.name };
      persistSession();
      if (_onCredential) _onCredential({ credential: _credential, email: _user.email, name: _user.name });
    },
    auto_select: false,
  });
}

// Render Google's official sign-in button into a container element.
// This bypasses FedCM/One Tap issues — always works.
export function renderSignInButton(container) {
  if (!window.google || !container) return;
  google.accounts.id.renderButton(container, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    width: 350,
  });
}

export function signOut() {
  if (_refreshTimer) {
    clearTimeout(_refreshTimer);
    _refreshTimer = null;
  }
  if (_user?.email) {
    google.accounts.id.revoke(_user.email, () => {});
  }
  _credential = null;
  _user = null;
  clearSession();
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

// Restore a previous session from sessionStorage (call on app mount)
export function tryRestoreSession() {
  try {
    const saved = sessionStorage.getItem('po_auth');
    if (!saved) return false;
    const { credential, user } = JSON.parse(saved);
    const payload = decodeJwtPayload(credential);
    if (!payload || payload.exp * 1000 <= Date.now()) {
      sessionStorage.removeItem('po_auth');
      return false;
    }
    _credential = credential;
    _user = user;
    return true;
  } catch {
    sessionStorage.removeItem('po_auth');
    return false;
  }
}

// Schedule a silent token refresh.
// Warns via onExpiringSoon 5min before expiry, attempts refresh 2min before.
export function scheduleTokenRefresh(clientId, { onRefreshed, onExpired, onExpiringSoon }) {
  if (_refreshTimer) clearTimeout(_refreshTimer);

  const payload = decodeJwtPayload(_credential);
  if (!payload) return;

  const msUntilWarning = (payload.exp * 1000) - Date.now() - 5 * 60_000;
  const msUntilRefresh = (payload.exp * 1000) - Date.now() - 2 * 60_000;

  if (msUntilWarning > 0 && onExpiringSoon) {
    setTimeout(() => onExpiringSoon(), msUntilWarning);
  }

  _refreshTimer = setTimeout(() => {
    silentRefresh(clientId).then(() => {
      onRefreshed(getUser());
      scheduleTokenRefresh(clientId, { onRefreshed, onExpired, onExpiringSoon });
    }).catch(() => {
      onExpired();
    });
  }, Math.max(msUntilRefresh, 0));
}

// Attempt silent re-auth via Google One Tap with auto_select.
// Best-effort — if FedCM blocks it, the onExpired callback handles sign-out.
function silentRefresh(clientId) {
  return new Promise((resolve, reject) => {
    // Temporarily re-initialize with auto_select to try silent refresh
    const savedCallback = _onCredential;
    google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (!response.credential) {
          reject(new Error('Silent refresh failed'));
          return;
        }
        const payload = decodeJwtPayload(response.credential);
        if (!payload) {
          reject(new Error('Invalid token from refresh'));
          return;
        }
        _credential = response.credential;
        _user = { email: payload.email, name: payload.name };
        persistSession();
        // Restore the original callback for the rendered button
        _onCredential = savedCallback;
        resolve();
      },
      auto_select: true,
    });
    google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        _onCredential = savedCallback;
        reject(new Error('Silent refresh suppressed'));
      }
    });
  });
}
