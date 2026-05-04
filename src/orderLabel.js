import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import bwipjs from 'bwip-js';
import logoUrl from './assets/packing-list-logo.jpeg';
import { computeLabelsForLineItems, findMissingUpcs, resolveCaseSize } from './orderLabelLogic';

export { computeLabelsForLineItems, findMissingUpcs, resolveCaseSize };

pdfMake.addVirtualFileSystem(pdfFonts);

const PAGE_WIDTH = 432;
const PAGE_HEIGHT = 288;
const PAGE_MARGIN = 14;

const formatDate = (isoDate) => {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${String(Number(m)).padStart(2, '0')}/${String(Number(d)).padStart(2, '0')}/${y}`;
};

let cachedLogoDataUrl = null;
async function getLogoDataUrl() {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  const res = await fetch(logoUrl);
  const blob = await res.blob();
  cachedLogoDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return cachedLogoDataUrl;
}

const barcodeCache = new Map();
function getBarcodeDataUrl(upc) {
  if (barcodeCache.has(upc)) return barcodeCache.get(upc);
  const canvas = document.createElement('canvas');
  bwipjs.toCanvas(canvas, {
    bcid: 'upca',
    text: upc,
    scale: 3,
    height: 16,
    includetext: true,
    textxalign: 'center',
    textsize: 10,
  });
  const dataUrl = canvas.toDataURL('image/png');
  barcodeCache.set(upc, dataUrl);
  return dataUrl;
}

function buildLabelContent({ poNumber, deliverByDate, label, logoDataUrl, barcodeDataUrl }) {
  return [
    {
      text: `PO# ${poNumber || ''}`,
      fontSize: 38,
      bold: true,
      alignment: 'center',
      margin: [0, 0, 0, 14],
    },
    {
      columns: [
        { text: label.retailerSku, fontSize: 22, bold: true, alignment: 'left', width: '*' },
        { text: `CASE OF ${label.caseOf}`, fontSize: 22, bold: true, alignment: 'right', width: '*' },
      ],
      margin: [0, 0, 0, 14],
    },
    {
      columns: [
        { image: logoDataUrl, fit: [150, 90], width: '*', alignment: 'left' },
        barcodeDataUrl
          ? { image: barcodeDataUrl, fit: [180, 90], width: '*', alignment: 'right' }
          : { text: '', width: '*' },
      ],
      margin: [0, 0, 0, 12],
    },
    {
      text: [
        { text: 'DELIVER ON: ', bold: true },
        { text: formatDate(deliverByDate), bold: false },
      ],
      fontSize: 18,
      alignment: 'center',
    },
  ];
}

export function buildOrderLabelDocDef({ poNumber, deliverByDate, label, logoDataUrl, barcodeDataUrl }) {
  return {
    pageSize: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
    pageMargins: [PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN],
    defaultStyle: { fontSize: 12 },
    content: buildLabelContent({ poNumber, deliverByDate, label, logoDataUrl, barcodeDataUrl }),
  };
}

export function buildOrderLabelsMultiPageDocDef({ poNumber, deliverByDate, labels, logoDataUrl }) {
  const content = [];
  labels.forEach((label, idx) => {
    const barcodeDataUrl = label.upc ? getBarcodeDataUrl(label.upc) : null;
    if (idx > 0) content.push({ text: '', pageBreak: 'before' });
    content.push(...buildLabelContent({ poNumber, deliverByDate, label, logoDataUrl, barcodeDataUrl }));
  });
  return {
    pageSize: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
    pageMargins: [PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN],
    defaultStyle: { fontSize: 12 },
    content,
  };
}

export async function downloadOrderLabelsPdf({ poNumber, deliverByDate, lineItems, masterSkus }) {
  const labels = computeLabelsForLineItems(lineItems, masterSkus);
  if (labels.length === 0) return;
  const logoDataUrl = await getLogoDataUrl();
  const docDef = buildOrderLabelsMultiPageDocDef({ poNumber, deliverByDate, labels, logoDataUrl });
  pdfMake.createPdf(docDef).download(`Order-Labels-${poNumber || 'PO'}.pdf`);
}

export async function getOrderLabelPdfsBase64({ poNumber, deliverByDate, lineItems, masterSkus }) {
  const labels = computeLabelsForLineItems(lineItems, masterSkus);
  const logoDataUrl = await getLogoDataUrl();
  const out = [];
  for (const label of labels) {
    const barcodeDataUrl = label.upc ? getBarcodeDataUrl(label.upc) : null;
    const docDef = buildOrderLabelDocDef({
      poNumber, deliverByDate, label, logoDataUrl, barcodeDataUrl,
    });
    const pdf = pdfMake.createPdf(docDef);
    const base64 = await pdf.getBase64();
    const filename = `Label - PO ${poNumber} - ${label.retailerSku} - CASE OF ${label.caseOf}.pdf`;
    out.push({ base64, filename });
  }
  return out;
}
