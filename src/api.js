// ── Google Apps Script API Client ────────────────────────────
// All requests go to your GAS web app URL with a Google ID token.
// The token is verified server-side against Google's tokeninfo endpoint.

import { getCredential } from './auth';

const GAS_URL = import.meta.env.VITE_GAS_URL;

async function gasRequest(action, payload) {
  if (!GAS_URL || GAS_URL.includes('YOUR_DEPLOYMENT_ID')) {
    throw new Error('Google Apps Script URL not configured. Check your .env file.');
  }

  const idToken = getCredential();
  if (!idToken) {
    throw new Error('Not signed in.');
  }

  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // GAS requires text/plain for CORS
    body: JSON.stringify({
      idToken,
      _origin: window.location.origin,
      action,
      payload,
    }),
  });

  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Invalid response from server: ' + text.substring(0, 100));
  }

  if (data.error) {
    throw new Error(data.error + (data.message ? ': ' + data.message : ''));
  }

  return data;
}

export const api = {
  createOrder: (payload) => gasRequest('create_order', payload),
  getStores: () => gasRequest('get_stores'),
  testConnection: () => gasRequest('test_connection'),
};

export function isConfigured() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return (
    GAS_URL &&
    !GAS_URL.includes('YOUR_DEPLOYMENT_ID') &&
    clientId &&
    !clientId.includes('YOUR_GOOGLE_CLIENT_ID')
  );
}

// ── Local config persistence ────────────────────────────────
export function loadConfig() {
  try {
    const raw = localStorage.getItem('po_config');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveConfig(config) {
  localStorage.setItem('po_config', JSON.stringify(config));
}

export function exportConfigFile(config) {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'po-config.json'; a.click();
  URL.revokeObjectURL(url);
}

export function importConfigFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return reject(new Error('No file selected'));
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (parsed.retailers && parsed.masterSkus && parsed.retailerAliases) {
          resolve(parsed);
        } else {
          reject(new Error('Invalid config: must have retailers, masterSkus, retailerAliases'));
        }
      } catch (err) { reject(err); }
    };
    input.click();
  });
}
