import logoUrl from './assets/packing-list-logo.jpeg';

const formatDate = (isoDate) => {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${Number(m)}/${Number(d)}/${y}`;
};

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const ROW_COUNT = 15;

export function buildPackingListHtml({ poNumber, orderDate, lineItems, shipTo, notes, logoDataUrl }) {
  const totalOrdered = lineItems.reduce((a, b) => a + Number(b.quantity || 0), 0);
  const shipDate = orderDate;

  const customerName = shipTo?.company?.trim() || shipTo?.name?.trim() || '';
  const customerCityLine = [shipTo?.city, shipTo?.state].filter(Boolean).join(', ')
    + (shipTo?.zip ? ` ${shipTo.zip}` : '');
  const customerContact = [shipTo?.phone, shipTo?.email].filter(Boolean).join(' | ');
  const customerBlock = customerName ? `
        <div class="addr">
          <div class="company">${escapeHtml(customerName)}</div>
          ${shipTo?.address1 ? `<div>${escapeHtml(shipTo.address1)}</div>` : ''}
          ${shipTo?.address2 ? `<div>${escapeHtml(shipTo.address2)}</div>` : ''}
          ${customerCityLine.trim() ? `<div>${escapeHtml(customerCityLine)}</div>` : ''}
          ${customerContact ? `<div class="contact">${escapeHtml(customerContact)}</div>` : ''}
        </div>` : '';

  const rows = [];
  for (let i = 0; i < ROW_COUNT; i++) {
    const item = lineItems[i];
    if (item) {
      const productNumber = (item.retailerName && item.retailerName !== item.name)
        ? item.retailerName
        : item.sku;
      rows.push(`
        <tr>
          <td class="c">${i + 1}</td>
          <td class="c">${item.quantity}</td>
          <td class="c">${item.quantity}</td>
          <td class="c">${escapeHtml(item.name)}</td>
          <td class="c">${escapeHtml(productNumber)}</td>
        </tr>`);
    } else {
      rows.push(`
        <tr>
          <td>&nbsp;</td><td></td><td></td><td></td><td></td>
        </tr>`);
    }
  }

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Packing List ${escapeHtml(poNumber)}</title>
<style>
  @page { size: letter; margin: 0.5in 1in 0.5in 0.5in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #000; background: #fff; }
  body, body * { font-family: Arial, sans-serif; }
  body { padding: 24px 96px 24px 32px; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
  .header h1 { font-size: 36px; font-weight: 400; margin: 0 0 14px 0; letter-spacing: -0.5px; }
  .header .addresses { display: flex; gap: 48px; }
  .header .addr { font-size: 11px; line-height: 1.45; }
  .header .addr .company { font-weight: 700; margin-bottom: 2px; }
  .header .contact { margin-top: 8px; font-size: 11px; }
  .header img { width: 110px; height: 110px; object-fit: contain; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .meta-table { margin-bottom: 14px; }
  .meta-table th, .meta-table td { border: 1px solid #000; height: 22px; }
  .meta-table th { background: #CFD8E8; font-size: 11px; font-weight: 700; text-align: center; }
  .meta-table td { text-align: center; font-size: 12px; padding: 2px 6px; }
  .meta-table td.fill { background: #FFFF00; }
  .meta-table td.blank { background: #fff; }
  .items-table th, .items-table td { border: 1px solid #000; font-size: 11px; }
  .items-table th { background: #CFD8E8; font-weight: 700; text-align: center; padding: 6px 4px; }
  .items-table td { height: 22px; padding: 3px 6px; }
  .items-table td.c { text-align: center; }
  .totals-table { margin-top: 0; border-top: none; }
  .totals-table th, .totals-table td { border: 1px solid #000; font-size: 11px; }
  .totals-table th { background: #CFD8E8; font-weight: 700; text-align: center; padding: 6px 4px; }
  .totals-table td { height: 22px; text-align: center; padding: 3px 6px; }
  .notes-table { margin-top: 14px; }
  .notes-table th { background: #CFD8E8; font-weight: 700; text-align: center; padding: 6px; font-size: 11px; border: 1px solid #000; }
  .notes-table td { border: 1px solid #000; min-height: 22px; padding: 6px 8px; font-size: 11px; white-space: pre-wrap; }
  .received { margin-top: 26px; }
  .received .label { font-weight: 700; font-size: 11px; margin-bottom: 18px; }
  .received .lines { display: grid; grid-template-columns: 1fr 1.4fr 1fr; gap: 20px; }
  .received .lines .field { background: #FFFF00; border-bottom: 1px solid #000; height: 18px; }
  .received .lines .caption { font-size: 10px; margin-top: 3px; }
  @media print {
    body { padding: 0; }
    .no-print { display: none !important; }
  }
  .toolbar {
    position: fixed; top: 12px; right: 12px; background: #fff;
    border: 1px solid #888; border-radius: 6px; padding: 8px 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-size: 12px;
  }
  .toolbar button {
    background: #2563eb; color: #fff; border: none; padding: 6px 12px;
    border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;
  }
</style>
</head>
<body>
  <div class="no-print toolbar">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="header">
    <div>
      <h1>Packing List</h1>
      <div class="addresses">
        <div class="addr">
          <div class="company">Honeydew Sleep</div>
          <div>4670 Calle Carga Ste. A,</div>
          <div>Camarillo, CA 93012</div>
          <div class="contact">(805) 657-5768 | jonathan@honeydewsleep.com</div>
        </div>
        ${customerBlock}
      </div>
    </div>
    <img src="${logoDataUrl}" alt="Honeydew Sleep">
  </div>

  <table class="meta-table">
    <colgroup>
      <col style="width:16%"><col style="width:16%"><col style="width:42%"><col style="width:26%">
    </colgroup>
    <tr>
      <th>Order Date</th>
      <th>Ship Date</th>
      <th></th>
      <th>Customer PO Number</th>
    </tr>
    <tr>
      <td class="fill">${escapeHtml(formatDate(orderDate))}</td>
      <td class="fill">${escapeHtml(formatDate(shipDate))}</td>
      <td class="blank"></td>
      <td class="fill">${escapeHtml(poNumber)}</td>
    </tr>
  </table>

  <table class="items-table">
    <colgroup>
      <col style="width:10%"><col style="width:12%"><col style="width:12%"><col style="width:42%"><col style="width:24%">
    </colgroup>
    <thead>
      <tr>
        <th>Line Item</th>
        <th>Quantity<br>Ordered</th>
        <th>Quantity<br>Shipped</th>
        <th>Description</th>
        <th>Product Number</th>
      </tr>
    </thead>
    <tbody>
      ${rows.join('')}
    </tbody>
  </table>

  <table class="totals-table">
    <colgroup>
      <col style="width:16%"><col style="width:16%"><col style="width:18%"><col style="width:50%">
    </colgroup>
    <tr>
      <th>Total Ordered</th>
      <th>Total Shipped</th>
      <th>Total<br>Backordered</th>
      <th style="text-align:left; padding-left:8px;">Shipment Notes:</th>
    </tr>
    <tr>
      <td>${totalOrdered}</td>
      <td>${totalOrdered}</td>
      <td>0</td>
      <td></td>
    </tr>
  </table>

  <table class="notes-table">
    <tr><th>Additional Notes</th></tr>
    <tr><td>${escapeHtml(notes || '')}</td></tr>
  </table>

  <div class="received">
    <div class="label">RECEIVED BY:</div>
    <div class="lines">
      <div>
        <div class="field"></div>
        <div class="caption">PRINT NAME</div>
      </div>
      <div>
        <div class="field"></div>
        <div class="caption">SIGN NAME</div>
      </div>
      <div>
        <div class="field"></div>
        <div class="caption">DATE</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function openPackingList({ poNumber, orderDate, lineItems, shipTo, notes }) {
  const html = buildPackingListHtml({ poNumber, orderDate, lineItems, shipTo, notes, logoDataUrl: logoUrl });
  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow pop-ups to generate the packing list.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.onload = () => win.print();
}
