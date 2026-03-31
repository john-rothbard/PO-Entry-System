// ============================================================
// PO ENTRY SYSTEM — Google Apps Script
// ============================================================
// This script acts as a secure middleware between your local
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

  // Shared secret — MUST match what's in your React app
  // Generate something random, e.g.: crypto.randomUUID() in browser console
  // Example: 'a7b3f9e2-4d1c-8f6a-2e5b-9c0d3f7a1b4e'
  APP_SECRET: 'CHANGE_ME_TO_A_RANDOM_STRING',

  // Allowed origins — add your Netlify URL here after deploying
  // Leave empty to allow all origins (fine for local dev, lock down for production)
  // Example: ['https://your-app.netlify.app', 'http://localhost:3000']
  ALLOWED_ORIGINS: [],
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

    // ── SECURITY CHECK ──────────────────────────────────────
    if (!body.appSecret || body.appSecret !== CONFIG.APP_SECRET) {
      logSecurity_('AUTH_FAILED', e);
      return createCorsResponse({
        error: 'Unauthorized',
        message: 'Invalid or missing authentication'
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
        return handleCreateOrder_(body.payload);
      case 'get_stores':
        return handleGetStores_();
      case 'test_connection':
        return handleTestConnection_();
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
function handleCreateOrder_(payload) {
  if (!payload || !payload.orderNumber) {
    return createCorsResponse({ error: 'Missing order payload' }, 400);
  }
  
  try {
    // 1. Send to ShipStation
    const result = shipStationRequest_('/orders/createorder', 'post', payload);
    
    // 2. Log to Google Sheet
    logOrder_(payload, result, 'SUCCESS');
    
    return createCorsResponse({
      success: true,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      orderKey: result.orderKey,
      message: 'Order created in ShipStation',
    });
    
  } catch (err) {
    // Log the failure too
    logOrder_(payload, null, 'FAILED: ' + err.message);
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
// GOOGLE SHEET LOGGING
// ============================================================

function getOrCreateSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function logOrder_(payload, result, status) {
  try {
    const sheet = getOrCreateSheet_('Order Log');
    
    // Add headers if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Timestamp',
        'Status', 
        'PO Number',
        'Retailer',
        'Store ID',
        'Ship To Name',
        'Ship To City',
        'Ship To State',
        'Items Count',
        'Items Detail',
        'Shipping',
        'Tax',
        'Order Total',
        'SS Order ID',
        'SS Order Key',
      ]);
      // Bold the header row
      sheet.getRange(1, 1, 1, 15).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    // Calculate total
    const itemsTotal = (payload.items || []).reduce(function(sum, item) {
      return sum + (item.quantity * item.unitPrice);
    }, 0);
    const orderTotal = itemsTotal + (payload.shippingAmount || 0) + (payload.taxAmount || 0);
    
    // Items detail string
    const itemsDetail = (payload.items || []).map(function(item) {
      return item.sku + ' x' + item.quantity + ' @$' + item.unitPrice;
    }).join('; ');
    
    sheet.appendRow([
      new Date(),
      status,
      payload.orderNumber || '',
      payload.advancedOptions ? payload.advancedOptions.customField1 : '',
      payload.advancedOptions ? payload.advancedOptions.storeId : '',
      payload.shipTo ? payload.shipTo.name : '',
      payload.shipTo ? payload.shipTo.city : '',
      payload.shipTo ? payload.shipTo.state : '',
      (payload.items || []).length,
      itemsDetail,
      payload.shippingAmount || 0,
      payload.taxAmount || 0,
      orderTotal,
      result ? result.orderId : '',
      result ? result.orderKey : '',
    ]);
    
    // Color code the status
    const lastRow = sheet.getLastRow();
    const statusCell = sheet.getRange(lastRow, 2);
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
// UTILITY: Generate a secret (run this once manually)
// ============================================================
// Go to Apps Script editor, select this function, and click Run.
// Check the Execution Log for your generated secret.

function generateSecret() {
  var chars = 'abcdef0123456789';
  var secret = '';
  for (var i = 0; i < 8; i++) {
    if (i > 0) secret += '-';
    for (var j = 0; j < 4; j++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  Logger.log('');
  Logger.log('========================================');
  Logger.log('Your generated secret: ' + secret);
  Logger.log('========================================');
  Logger.log('');
  Logger.log('Put this in CONFIG.APP_SECRET in this script');
  Logger.log('AND in your React app\'s .env file as VITE_APP_SECRET');
}
