// ============================================================
// PO ENTRY SYSTEM — Google Apps Script
// ============================================================
// This script acts as a secure middleware between the hosted
// PO form and ShipStation's API.
//
// SETUP:
// 1. Create a new Google Sheet
// 2. Go to Extensions > Apps Script
// 3. Paste this entire file into Code.gs
// 4. Fill in the 3 config values below
// 5. Deploy > New Deployment > Web App
//    - Execute as: Me
//    - Who has access: Anyone
// 6. Copy the deployment URL into your React app's .env
// ============================================================

// ── CONFIGURATION — FILL THESE IN ──────────────────────────
var CONFIG = {
  // Your ShipStation API key and secret
  // Find at: ShipStation > Settings > Account > API Settings
  SHIPSTATION_API_KEY: 'YOUR_SHIPSTATION_API_KEY',
  SHIPSTATION_API_SECRET: 'YOUR_SHIPSTATION_API_SECRET',

  // Your Google OAuth Client ID (same one used in the React app)
  GOOGLE_CLIENT_ID: 'GOOGLE_CLIENT_ID',

  // Only allow sign-ins from this Google Workspace domain
  ALLOWED_DOMAIN: 'honeydewsleep.com',

  // Google Sheet ID — get this from the sheet URL:
  // https://docs.google.com/spreadsheets/d/THIS_PART/edit
  // Required because getActiveSpreadsheet() doesn't work in web app context
  SPREADSHEET_ID: 'SPREADSHEET_ID',

  // Allowed origins — add your GitHub Pages URL here after deploying
  // Leave empty to allow all origins (fine for local dev, lock down for production)
  // Example: ['https://john-rothbard.github.io', 'http://localhost:3000']
  ALLOWED_ORIGINS: [],

  // Asana integration — create tasks from submitted POs
  // Generate a PAT at: https://app.asana.com/0/developer-console
  ASANA_PAT: 'YOUR_ASANA_PAT',
  // Find GIDs in the Asana URL or via the API
  ASANA_PROJECT_GID: 'ASANA_GID',
  ASANA_SECTION_GID: 'ASANA_SECT_GID', // "test section" — will become dynamic per-retailer later
};

// ── CORS + Security Headers ─────────────────────────────────
function createCorsResponse(data, status) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ── Handle preflight OPTIONS (CORS) ─────────────────────────
function doOptions(e) {
  return createCorsResponse({ ok: true }, 200);
}

// ── Handle POST requests ────────────────────────────────────
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // ── ORIGIN CHECK ────────────────────────────────────────
    if (CONFIG.ALLOWED_ORIGINS.length > 0) {
      var origin = body._origin || '';
      if (CONFIG.ALLOWED_ORIGINS.indexOf(origin) === -1) {
        logSecurity_('ORIGIN_BLOCKED: ' + origin, e);
        return createCorsResponse({
          error: 'Forbidden',
          message: 'Origin not allowed'
        }, 403);
      }
    }

    // ── GOOGLE ID TOKEN VERIFICATION ───────────────────────
    var authResult = verifyGoogleToken_(body.idToken);
    if (!authResult.valid) {
      logSecurity_('AUTH_FAILED: ' + authResult.reason, e);
      return createCorsResponse({
        error: 'Unauthorized',
        message: authResult.reason
      }, 403);
    }

    // ── Rate limiting (basic) ───────────────────────────────
    if (isRateLimited_()) {
      return createCorsResponse({
        error: 'Rate limited',
        message: 'Too many requests. Try again in a minute.'
      }, 429);
    }

    // ── Route the request ───────────────────────────────────
    var action = body.action;

    switch (action) {
      case 'create_order':
        return handleCreateOrder_(body.payload, authResult.email);
      case 'get_stores':
        return handleGetStores_();
      case 'test_connection':
        return handleTestConnection_();
      case 'create_asana_task':
        return handleCreateAsanaTask_(body.payload, authResult.email);
      default:
        return createCorsResponse({ error: 'Unknown action: ' + action }, 400);
    }

  } catch (err) {
    logError_('doPost', err);
    return createCorsResponse({ error: 'Server error', message: err.message }, 500);
  }
}

// ── Handle GET requests (health check) ──────────────────────
function doGet(e) {
  return createCorsResponse({ 
    status: 'ok', 
    service: 'PO Entry System',
    timestamp: new Date().toISOString() 
  }, 200);
}

// ============================================================
// GOOGLE TOKEN VERIFICATION
// ============================================================

function verifyGoogleToken_(idToken) {
  if (!idToken) {
    return { valid: false, reason: 'No ID token provided' };
  }
  try {
    var response = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + idToken,
      { muteHttpExceptions: true }
    );
    var code = response.getResponseCode();
    if (code !== 200) {
      return { valid: false, reason: 'Invalid or expired token' };
    }
    var claims = JSON.parse(response.getContentText());
    if (claims.aud !== CONFIG.GOOGLE_CLIENT_ID) {
      return { valid: false, reason: 'Token audience mismatch' };
    }
    if (claims.email_verified !== 'true' && claims.email_verified !== true) {
      return { valid: false, reason: 'Email not verified' };
    }
    if (claims.hd !== CONFIG.ALLOWED_DOMAIN) {
      return { valid: false, reason: 'Domain not allowed: ' + claims.hd };
    }
    return { valid: true, email: claims.email, name: claims.name };
  } catch (err) {
    return { valid: false, reason: 'Token verification error: ' + err.message };
  }
}

// ============================================================
// SHIPSTATION API HELPERS
// ============================================================

function shipStationRequest_(endpoint, method, payload) {
  const url = 'https://ssapi.shipstation.com' + endpoint;
  const auth = Utilities.base64Encode(CONFIG.SHIPSTATION_API_KEY + ':' + CONFIG.SHIPSTATION_API_SECRET);
  
  const options = {
    method: method || 'get',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/json',
    },
    muteHttpExceptions: true,
  };
  
  if (payload) {
    options.payload = JSON.stringify(payload);
  }
  
  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const text = response.getContentText();
  
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = { raw: text };
  }
  
  if (code < 200 || code >= 300) {
    throw new Error(data.ExceptionMessage || data.Message || 'ShipStation error: ' + code);
  }
  
  return data;
}

// ── Create Order ────────────────────────────────────────────
function handleCreateOrder_(payload, userEmail) {
  if (!payload || !payload.orderNumber) {
    return createCorsResponse({ error: 'Missing order payload' }, 400);
  }

  try {
    var result = shipStationRequest_('/orders/createorder', 'post', payload);
    logOrder_(payload, result, 'SUCCESS', userEmail);

    return createCorsResponse({
      success: true,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      orderKey: result.orderKey,
      message: 'Order created in ShipStation',
    });

  } catch (err) {
    logOrder_(payload, null, 'FAILED: ' + err.message, userEmail);
    return createCorsResponse({ error: err.message }, 502);
  }
}

// ── Get Stores ──────────────────────────────────────────────
function handleGetStores_() {
  try {
    const stores = shipStationRequest_('/stores', 'get');
    return createCorsResponse({ stores: stores });
  } catch (err) {
    return createCorsResponse({ error: err.message }, 502);
  }
}

// ── Test Connection ─────────────────────────────────────────
function handleTestConnection_() {
  try {
    const stores = shipStationRequest_('/stores', 'get');
    const count = Array.isArray(stores) ? stores.length : 0;
    return createCorsResponse({ 
      success: true, 
      message: 'Connected to ShipStation. Found ' + count + ' store(s).',
      storeCount: count,
    });
  } catch (err) {
    return createCorsResponse({ error: 'Connection failed: ' + err.message }, 502);
  }
}

// ============================================================
// ASANA API
// ============================================================

function asanaRequest_(endpoint, method, payload) {
  var url = 'https://app.asana.com/api/1.0' + endpoint;
  var options = {
    method: method || 'get',
    headers: {
      'Authorization': 'Bearer ' + CONFIG.ASANA_PAT,
      'Content-Type': 'application/json',
    },
    muteHttpExceptions: true,
  };

  if (payload) {
    options.payload = JSON.stringify(payload);
  }

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var text = response.getContentText();

  var data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = { raw: text };
  }

  if (code < 200 || code >= 300) {
    var errMsg = (data.errors && data.errors[0] && data.errors[0].message) || 'Asana error: ' + code;
    throw new Error(errMsg);
  }

  return data;
}

function handleCreateAsanaTask_(payload, userEmail) {
  if (!payload || !payload.orderNumber) {
    return createCorsResponse({ error: 'Missing order data' }, 400);
  }

  if (CONFIG.ASANA_PAT === 'YOUR_ASANA_PAT') {
    return createCorsResponse({ error: 'Asana is not configured. Set ASANA_PAT in Apps Script.' }, 500);
  }

  try {
    var ship = payload.shipTo || {};
    var bill = payload.billTo || {};
    var items = payload.items || [];

    var itemLines = items.map(function(item) {
      return '  • ' + item.sku + '  ×' + item.quantity + '  @$' + Number(item.unitPrice).toFixed(2);
    }).join('\n');

    var itemsTotal = items.reduce(function(sum, item) {
      return sum + (item.quantity * item.unitPrice);
    }, 0);
    var orderTotal = itemsTotal + (payload.shippingAmount || 0) + (payload.taxAmount || 0);

    var notes = 'PO #' + payload.orderNumber + '\n'
      + 'Retailer: ' + (payload.retailer || '') + '\n'
      + 'Order Date: ' + (payload.orderDate || '') + '\n'
      + 'Submitted by: ' + (userEmail || '') + '\n'
      + (payload.shipStationOrderId ? 'ShipStation ID: ' + payload.shipStationOrderId + '\n' : '')
      + '\n'
      + '── Ship To ──\n'
      + (ship.name || '') + '\n'
      + (ship.street1 || '') + (ship.street2 ? '\n' + ship.street2 : '') + '\n'
      + (ship.city || '') + ', ' + (ship.state || '') + ' ' + (ship.postalCode || '') + '\n'
      + '\n'
      + '── Bill To ──\n'
      + (bill.name || '') + '\n'
      + (bill.street1 || '') + (bill.street2 ? '\n' + bill.street2 : '') + '\n'
      + (bill.city || '') + ', ' + (bill.state || '') + ' ' + (bill.postalCode || '') + '\n'
      + '\n'
      + '── Line Items ──\n'
      + itemLines + '\n'
      + '\n'
      + 'Shipping: $' + Number(payload.shippingAmount || 0).toFixed(2) + '\n'
      + 'Tax: $' + Number(payload.taxAmount || 0).toFixed(2) + '\n'
      + 'Total: $' + orderTotal.toFixed(2);

    var taskData = {
      data: {
        name: 'PO #' + payload.orderNumber + ' — ' + (payload.retailer || 'Unknown'),
        notes: notes,
        projects: [CONFIG.ASANA_PROJECT_GID],
        memberships: [{ project: CONFIG.ASANA_PROJECT_GID, section: CONFIG.ASANA_SECTION_GID }],
      }
    };

    if (payload.orderDate) {
      taskData.data.due_on = payload.orderDate;
    }

    var result = asanaRequest_('/tasks', 'post', taskData);

    return createCorsResponse({
      success: true,
      taskId: result.data.gid,
      taskUrl: 'https://app.asana.com/0/' + CONFIG.ASANA_PROJECT_GID + '/' + result.data.gid,
      message: 'Task created in Asana',
    });

  } catch (err) {
    return createCorsResponse({ error: 'Asana: ' + err.message }, 502);
  }
}

// ============================================================
// GOOGLE SHEET LOGGING
// ============================================================

function getOrCreateSheet_(name) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function logOrder_(payload, result, status, userEmail) {
  try {
    var sheet = getOrCreateSheet_('Order Log');

    if (sheet.getLastRow() === 0) {
      var headers = [
        'Timestamp', 'Status', 'Email Address', 'Retailer',
        'PO Number', 'Order Date',
        'Ship To Name', 'Ship To Address 1', 'Ship To Address 2',
        'Ship To City', 'Ship To State', 'Ship To Zip',
        'Bill To Name', 'Bill To Address 1', 'Bill To Address 2',
        'Bill To City', 'Bill To State', 'Bill To Zip',
        'Items Detail', 'Shipping', 'Tax', 'Order Total',
        'SS Order ID', 'SS Order Key',
      ];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    var itemsTotal = (payload.items || []).reduce(function(sum, item) {
      return sum + (item.quantity * item.unitPrice);
    }, 0);
    var orderTotal = itemsTotal + (payload.shippingAmount || 0) + (payload.taxAmount || 0);

    var itemsDetail = (payload.items || []).map(function(item) {
      return item.sku + ' x' + item.quantity + ' @$' + item.unitPrice;
    }).join('; ');

    var ship = payload.shipTo || {};
    var bill = payload.billTo || {};

    sheet.appendRow([
      new Date(),
      status,
      userEmail || '',
      payload.advancedOptions ? payload.advancedOptions.customField1 : '',
      payload.orderNumber || '',
      payload.orderDate || '',
      ship.name || '', ship.street1 || '', ship.street2 || '',
      ship.city || '', ship.state || '', ship.postalCode || '',
      bill.name || '', bill.street1 || '', bill.street2 || '',
      bill.city || '', bill.state || '', bill.postalCode || '',
      itemsDetail,
      payload.shippingAmount || 0,
      payload.taxAmount || 0,
      orderTotal,
      result ? result.orderId : '',
      result ? result.orderKey : '',
    ]);

    var lastRow = sheet.getLastRow();
    var statusCell = sheet.getRange(lastRow, 2);
    if (status === 'SUCCESS') {
      statusCell.setBackground('#d4edda').setFontColor('#155724');
    } else {
      statusCell.setBackground('#f8d7da').setFontColor('#721c24');
    }

  } catch (err) {
    Logger.log('Failed to log order: ' + err.message);
  }
}

function logSecurity_(event, request) {
  try {
    const sheet = getOrCreateSheet_('Security Log');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'Event', 'IP/Details']);
      sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    }
    sheet.appendRow([
      new Date(),
      event,
      request ? JSON.stringify(request.parameter || {}).substring(0, 200) : '',
    ]);
  } catch (err) {
    Logger.log('Failed to log security event: ' + err.message);
  }
}

function logError_(context, err) {
  try {
    const sheet = getOrCreateSheet_('Error Log');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'Context', 'Error']);
      sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    }
    sheet.appendRow([new Date(), context, err.message || String(err)]);
  } catch (e) {
    Logger.log('Failed to log error: ' + e.message);
  }
}

// ============================================================
// RATE LIMITING (simple, per-minute)
// ============================================================

function isRateLimited_() {
  const cache = CacheService.getScriptCache();
  const key = 'rate_limit_counter';
  const current = Number(cache.get(key) || 0);
  
  if (current >= 30) { // Max 30 requests per 60 seconds
    return true;
  }
  
  cache.put(key, String(current + 1), 60); // Expires in 60 seconds
  return false;
}

// ============================================================
// UTILITY: Test auth setup (run this once manually to verify)
// ============================================================
// Select this function in the Apps Script editor and click Run.
// It will log your current CONFIG values (without secrets).

function testAuthSetup() {
  Logger.log('GOOGLE_CLIENT_ID set: ' + (CONFIG.GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID'));
  Logger.log('ALLOWED_DOMAIN: ' + CONFIG.ALLOWED_DOMAIN);
  Logger.log('SHIPSTATION_API_KEY set: ' + (CONFIG.SHIPSTATION_API_KEY !== 'YOUR_SHIPSTATION_API_KEY'));
  Logger.log('ALLOWED_ORIGINS: ' + JSON.stringify(CONFIG.ALLOWED_ORIGINS));
}
