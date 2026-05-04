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
      case 'create_asana_task_with_attachment':
        return handleCreateAsanaTaskWithAttachment_(body.payload, authResult.email);
      case 'log_packing_list':
        return handleLogPackingList_(body.payload, authResult.email);
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
    recordFailure_('SS Submitted', payload, userEmail, 'Missing order payload');
    return createCorsResponse({ error: 'Missing order payload' }, 400);
  }

  try {
    var result = shipStationRequest_('/orders/createorder', 'post', payload);
    logOrder_(payload, result, 'SUCCESS', userEmail);
    logActivity_(payload, userEmail, {
      ssSubmittedAt: new Date(),
      ssOrderId: result.orderId,
      ssOrderKey: result.orderKey,
    });
    logAction_('SS Submitted', 'success', payload, userEmail, 'SS#' + result.orderId);

    return createCorsResponse({
      success: true,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      orderKey: result.orderKey,
      message: 'Order created in ShipStation',
    });

  } catch (err) {
    logOrder_(payload, null, 'FAILED: ' + err.message, userEmail);
    recordFailure_('SS Submitted', payload, userEmail, err.message);
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

function handleCreateAsanaTaskWithAttachment_(payload, userEmail) {
  if (!payload || !payload.orderNumber) {
    recordFailure_('Asana Sent', payload, userEmail, 'Missing order data');
    return createCorsResponse({ error: 'Missing order data' }, 400);
  }
  if (!payload.pdfBase64) {
    recordFailure_('Asana Sent', payload, userEmail, 'Missing PDF data');
    return createCorsResponse({ error: 'Missing PDF data' }, 400);
  }
  if (CONFIG.ASANA_PAT === 'YOUR_ASANA_PAT') {
    recordFailure_('Asana Sent', payload, userEmail, 'Asana not configured (ASANA_PAT)');
    return createCorsResponse({ error: 'Asana is not configured. Set ASANA_PAT in Apps Script.' }, 500);
  }
  if (!payload.asanaSectionGid) {
    var msg = 'No Asana section configured for retailer "' + (payload.retailer || 'Unknown')
      + '". Open Config → Retailers and set its Asana Section GID.';
    recordFailure_('Asana Sent', payload, userEmail, msg);
    return createCorsResponse({ error: msg }, 400);
  }

  try {
    var taskData = {
      data: {
        name: 'PO #' + payload.orderNumber,
        projects: [CONFIG.ASANA_PROJECT_GID],
        memberships: [{ project: CONFIG.ASANA_PROJECT_GID, section: payload.asanaSectionGid }],
      }
    };
    if (payload.orderDate) {
      taskData.data.due_on = payload.orderDate;
    }

    var taskResult = asanaRequest_('/tasks', 'post', taskData);
    var taskGid = taskResult.data.gid;

    var filename = payload.pdfFilename || ('Packing-List-' + payload.orderNumber + '.pdf');
    var pdfBlob = Utilities.newBlob(Utilities.base64Decode(payload.pdfBase64), 'application/pdf', filename);

    var attachOptions = {
      method: 'post',
      headers: { 'Authorization': 'Bearer ' + CONFIG.ASANA_PAT },
      payload: { file: pdfBlob },
      muteHttpExceptions: true,
    };
    var attachResponse = UrlFetchApp.fetch(
      'https://app.asana.com/api/1.0/tasks/' + taskGid + '/attachments',
      attachOptions
    );
    var attachCode = attachResponse.getResponseCode();
    if (attachCode < 200 || attachCode >= 300) {
      var attachText = attachResponse.getContentText();
      var attachData;
      try { attachData = JSON.parse(attachText); } catch (e) { attachData = { raw: attachText }; }
      var errMsg = (attachData.errors && attachData.errors[0] && attachData.errors[0].message)
        || 'Asana attachment error: ' + attachCode;
      throw new Error(errMsg);
    }

    if (payload.attachmentBase64) {
      var extraName = payload.attachmentFilename || 'attachment';
      var extraBlob = Utilities.newBlob(Utilities.base64Decode(payload.attachmentBase64), null, extraName);
      var extraOptions = {
        method: 'post',
        headers: { 'Authorization': 'Bearer ' + CONFIG.ASANA_PAT },
        payload: { file: extraBlob },
        muteHttpExceptions: true,
      };
      var extraResponse = UrlFetchApp.fetch(
        'https://app.asana.com/api/1.0/tasks/' + taskGid + '/attachments',
        extraOptions
      );
      var extraCode = extraResponse.getResponseCode();
      if (extraCode < 200 || extraCode >= 300) {
        var extraText = extraResponse.getContentText();
        var extraData;
        try { extraData = JSON.parse(extraText); } catch (e) { extraData = { raw: extraText }; }
        var extraErr = (extraData.errors && extraData.errors[0] && extraData.errors[0].message)
          || 'Asana attachment error: ' + extraCode;
        throw new Error('Extra attachment failed: ' + extraErr);
      }
    }

    if (payload.orderLabels && payload.orderLabels.length) {
      for (var i = 0; i < payload.orderLabels.length; i++) {
        var lbl = payload.orderLabels[i];
        if (!lbl || !lbl.base64) continue;
        var lblName = lbl.filename || ('Order-Label-' + (i + 1) + '.pdf');
        var lblBlob = Utilities.newBlob(Utilities.base64Decode(lbl.base64), 'application/pdf', lblName);
        var lblResponse = UrlFetchApp.fetch(
          'https://app.asana.com/api/1.0/tasks/' + taskGid + '/attachments',
          {
            method: 'post',
            headers: { 'Authorization': 'Bearer ' + CONFIG.ASANA_PAT },
            payload: { file: lblBlob },
            muteHttpExceptions: true,
          }
        );
        var lblCode = lblResponse.getResponseCode();
        if (lblCode < 200 || lblCode >= 300) {
          var lblText = lblResponse.getContentText();
          var lblData;
          try { lblData = JSON.parse(lblText); } catch (e) { lblData = { raw: lblText }; }
          var lblErr = (lblData.errors && lblData.errors[0] && lblData.errors[0].message)
            || 'Asana attachment error: ' + lblCode;
          throw new Error('Order label "' + lblName + '" failed: ' + lblErr);
        }
      }
    }

    logActivity_(payload, userEmail, {
      asanaSentAt: new Date(),
      asanaTaskGid: taskGid,
    });
    logAction_('Asana Sent', 'success', payload, userEmail, 'Task ' + taskGid);

    return createCorsResponse({
      success: true,
      taskId: taskGid,
      taskUrl: 'https://app.asana.com/0/' + CONFIG.ASANA_PROJECT_GID + '/' + taskGid,
      message: 'Task with packing list created in Asana',
    });

  } catch (err) {
    recordFailure_('Asana Sent', payload, userEmail, err.message);
    return createCorsResponse({ error: 'Asana: ' + err.message }, 502);
  }
}

// ── Log Packing List Download ──────────────────────────────
function handleLogPackingList_(payload, userEmail) {
  if (!payload || !payload.orderNumber) {
    recordFailure_('PL Downloaded', payload, userEmail, 'Missing order data');
    return createCorsResponse({ error: 'Missing order data' }, 400);
  }
  try {
    logActivity_(payload, userEmail, { plDownloadedAt: new Date() });
    logAction_('PL Downloaded', 'success', payload, userEmail, '');
    return createCorsResponse({ success: true });
  } catch (err) {
    recordFailure_('PL Downloaded', payload, userEmail, err.message);
    return createCorsResponse({ error: err.message }, 500);
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

// ── Order Activity (sessionId-keyed upsert) ────────────────
// One row per "session" (form fill). PL download / SS submit / Asana send
// each fill in their own timestamp + ID columns on the same row. Failures
// don't fill the timestamp but do update Status + Last Attempt cells.
function logActivity_(payload, userEmail, updates) {
  try {
    if (!payload) return;
    var sheet = getOrCreateSheet_('Order Activity');
    var headers = [
      'Created At', 'Session ID', 'Email Address', 'Retailer',
      'PO Number', 'Order Date',
      'Ship To Name', 'Ship To Address 1', 'Ship To Address 2',
      'Ship To City', 'Ship To State', 'Ship To Zip',
      'Bill To Name', 'Bill To Address 1', 'Bill To Address 2',
      'Bill To City', 'Bill To State', 'Bill To Zip',
      'Items Detail', 'Shipping', 'Tax', 'Order Total',
      'PL Downloaded At', 'SS Submitted At', 'SS Order ID', 'SS Order Key',
      'Asana Sent At', 'Asana Task GID',
      'Status', 'Last Attempt',
    ];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else {
      var currentLastCol = sheet.getLastColumn();
      if (currentLastCol < headers.length) {
        sheet.getRange(1, currentLastCol + 1, 1, headers.length - currentLastCol)
          .setValues([headers.slice(currentLastCol)])
          .setFontWeight('bold');
      }
    }

    var sessionId = payload.sessionId || '';
    var ship = payload.shipTo || {};
    var bill = payload.billTo || {};
    var items = payload.items || [];
    var itemsTotal = items.reduce(function(s, i) { return s + (i.quantity * i.unitPrice); }, 0);
    var orderTotal = itemsTotal + (payload.shippingAmount || 0) + (payload.taxAmount || 0);
    var itemsDetail = items.map(function(i) {
      return i.sku + ' x' + i.quantity + ' @$' + i.unitPrice;
    }).join('; ');
    var orderDate = String(payload.orderDate || '').substring(0, 10);

    var snapshot = [
      sessionId,
      userEmail || '',
      payload.retailer || '',
      payload.orderNumber || '',
      orderDate,
      ship.name || '', ship.street1 || '', ship.street2 || '',
      ship.city || '', ship.state || '', ship.postalCode || '',
      bill.name || '', bill.street1 || '', bill.street2 || '',
      bill.city || '', bill.state || '', bill.postalCode || '',
      itemsDetail,
      payload.shippingAmount || 0,
      payload.taxAmount || 0,
      orderTotal,
    ];

    var lastRow = sheet.getLastRow();
    var rowIdx = -1;
    if (sessionId && lastRow > 1) {
      var sessionCol = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
      for (var i = 0; i < sessionCol.length; i++) {
        if (sessionCol[i][0] === sessionId) { rowIdx = i + 2; break; }
      }
    }

    var actionStartCol = 2 + snapshot.length; // 23
    var actionCellCount = 6;
    var existing = (rowIdx === -1)
      ? ['', '', '', '', '', '']
      : sheet.getRange(rowIdx, actionStartCol, 1, actionCellCount).getValues()[0];

    var merged = [
      updates.plDownloadedAt || existing[0] || '',
      updates.ssSubmittedAt || existing[1] || '',
      updates.ssOrderId || existing[2] || '',
      updates.ssOrderKey || existing[3] || '',
      updates.asanaSentAt || existing[4] || '',
      updates.asanaTaskGid || existing[5] || '',
    ];

    // Cumulative status from successful action timestamps
    var statusParts = [];
    if (merged[0]) statusParts.push('PL');
    if (merged[1]) statusParts.push('Submitted');
    if (merged[4]) statusParts.push('Asana');
    var status = statusParts.length === 3
      ? 'Complete'
      : (statusParts.length ? statusParts.join(' + ') : 'Pending');

    // Latest attempt summary (success or error) derived from this call's updates
    var lastAction, lastResult, lastErr;
    if (updates.plDownloadedAt)      { lastAction = 'PL Downloaded'; lastResult = 'success'; }
    else if (updates.ssSubmittedAt)  { lastAction = 'SS Submitted';  lastResult = 'success'; }
    else if (updates.asanaSentAt)    { lastAction = 'Asana Sent';    lastResult = 'success'; }
    else if (updates.plError)        { lastAction = 'PL Downloaded'; lastResult = 'error'; lastErr = updates.plError; }
    else if (updates.ssError)        { lastAction = 'SS Submitted';  lastResult = 'error'; lastErr = updates.ssError; }
    else if (updates.asanaError)     { lastAction = 'Asana Sent';    lastResult = 'error'; lastErr = updates.asanaError; }
    var lastAttempt = lastAction
      ? (lastResult === 'success' ? '✓ ' : '✗ ') + lastAction + (lastErr ? ': ' + lastErr : '')
      : '';

    if (rowIdx === -1) {
      var row = [new Date()].concat(snapshot).concat(merged).concat([status, lastAttempt]);
      sheet.appendRow(row);
      rowIdx = sheet.getLastRow();
    } else {
      sheet.getRange(rowIdx, 2, 1, snapshot.length).setValues([snapshot]);
      sheet.getRange(rowIdx, actionStartCol, 1, actionCellCount).setValues([merged]);
      var statusCol = actionStartCol + actionCellCount; // 29
      // preserve previous Last Attempt if this call carries no action (defensive)
      var prevLast = sheet.getRange(rowIdx, statusCol + 1).getValue();
      sheet.getRange(rowIdx, statusCol, 1, 2).setValues([[status, lastAttempt || prevLast || '']]);
    }

    // Color the Status cell
    var statusCol2 = actionStartCol + actionCellCount;
    var statusCell = sheet.getRange(rowIdx, statusCol2);
    if (lastResult === 'error') {
      statusCell.setBackground('#f8d7da').setFontColor('#721c24');
    } else if (status === 'Complete') {
      statusCell.setBackground('#d4edda').setFontColor('#155724');
    } else {
      statusCell.setBackground(null).setFontColor(null);
    }
  } catch (err) {
    Logger.log('Failed to log activity: ' + err.message);
  }
}

// ── recordFailure_: log a failure to both sheets in one call ───
function recordFailure_(action, payload, userEmail, errorMessage) {
  logAction_(action, 'error', payload || {}, userEmail, errorMessage);
  if (payload && payload.sessionId) {
    var updates = {};
    if (action === 'SS Submitted') updates.ssError = errorMessage;
    else if (action === 'Asana Sent') updates.asanaError = errorMessage;
    else if (action === 'PL Downloaded') updates.plError = errorMessage;
    logActivity_(payload, userEmail, updates);
  }
}

// ── Action Log (append-only event log) ─────────────────────
// One row per action attempt (success or failure). Carries Session ID
// so rows can be joined back to the Order Activity row.
function logAction_(action, status, payload, userEmail, detail) {
  try {
    var sheet = getOrCreateSheet_('Action Log');
    var headers = [
      'Timestamp', 'Action', 'Status', 'Session ID', 'Email Address',
      'Retailer', 'PO Number', 'Order Date',
      'Items', 'Order Total', 'Detail',
    ];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    var items = payload.items || [];
    var itemsTotal = items.reduce(function(s, i) { return s + (i.quantity * i.unitPrice); }, 0);
    var orderTotal = itemsTotal + (payload.shippingAmount || 0) + (payload.taxAmount || 0);
    var totalUnits = items.reduce(function(s, i) { return s + (i.quantity || 0); }, 0);
    var itemSummary = items.length + ' line(s), ' + totalUnits + ' units';

    sheet.appendRow([
      new Date(),
      action,
      status,
      payload.sessionId || '',
      userEmail || '',
      payload.retailer || '',
      payload.orderNumber || '',
      String(payload.orderDate || '').substring(0, 10),
      itemSummary,
      orderTotal,
      detail || '',
    ]);

    var lastRow = sheet.getLastRow();
    var statusCell = sheet.getRange(lastRow, 3);
    if (status === 'success') {
      statusCell.setBackground('#d4edda').setFontColor('#155724');
    } else {
      statusCell.setBackground('#f8d7da').setFontColor('#721c24');
    }
  } catch (err) {
    Logger.log('Failed to log action: ' + err.message);
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
// UTILITY: List Asana sections for the configured project
// ============================================================
// Run this once from the Apps Script editor (select the function,
// click Run, then View > Logs). It logs every section name + GID
// in your CONFIG.ASANA_PROJECT_GID project so you can paste the
// GIDs into each retailer in the AdminPanel.

function listAsanaSections() {
  if (!CONFIG.ASANA_PAT || CONFIG.ASANA_PAT === 'YOUR_ASANA_PAT') {
    Logger.log('ERROR: ASANA_PAT not configured.');
    return;
  }
  if (!CONFIG.ASANA_PROJECT_GID || CONFIG.ASANA_PROJECT_GID === 'ASANA_GID') {
    Logger.log('ERROR: ASANA_PROJECT_GID not configured.');
    return;
  }
  try {
    var result = asanaRequest_('/projects/' + CONFIG.ASANA_PROJECT_GID + '/sections', 'get');
    var sections = result.data || [];
    Logger.log('Found ' + sections.length + ' section(s) in project ' + CONFIG.ASANA_PROJECT_GID + ':');
    Logger.log('');
    sections.forEach(function(s) {
      Logger.log('  ' + s.gid + '  →  ' + s.name);
    });
  } catch (err) {
    Logger.log('ERROR: ' + err.message);
  }
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
