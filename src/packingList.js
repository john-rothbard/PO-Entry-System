import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import logoUrl from './assets/packing-list-logo.jpeg';

pdfMake.addVirtualFileSystem(pdfFonts);

const ROW_COUNT = 15;
const BLUE = '#CFD8E8';
const YELLOW = '#FFFF00';

const formatDate = (isoDate) => {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${Number(m)}/${Number(d)}/${y}`;
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

function buildCustomerStack(shipTo) {
  const name = shipTo?.company?.trim() || shipTo?.name?.trim() || '';
  if (!name) return { text: '', width: '*' };
  const cityLine = [shipTo?.city, shipTo?.state].filter(Boolean).join(', ')
    + (shipTo?.zip ? ` ${shipTo.zip}` : '');
  const contact = [shipTo?.phone, shipTo?.email].filter(Boolean).join(' | ');
  const lines = [{ text: name, bold: true }];
  if (shipTo?.address1) lines.push({ text: shipTo.address1 });
  if (shipTo?.address2) lines.push({ text: shipTo.address2 });
  if (cityLine.trim()) lines.push({ text: cityLine });
  if (contact) lines.push({ text: contact, margin: [0, 6, 0, 0] });
  return { stack: lines, width: '*' };
}

function thinBlackLayout() {
  return {
    hLineWidth: () => 0.7,
    vLineWidth: () => 0.7,
    hLineColor: () => '#000',
    vLineColor: () => '#000',
    paddingTop: () => 1.5,
    paddingBottom: () => 1.5,
    paddingLeft: () => 5,
    paddingRight: () => 5,
  };
}

function colHeader(text) {
  return { text, fillColor: BLUE, bold: true, alignment: 'center', fontSize: 9 };
}

function fillCell(text) {
  return { text, fillColor: YELLOW, alignment: 'center' };
}

export function buildPackingListDocDef({ poNumber, orderDate, shipDate, lineItems, shipTo, notes, logoDataUrl }) {
  const totalOrdered = lineItems.reduce((a, b) => a + Number(b.quantity || 0), 0);

  const itemRows = [];
  for (let i = 0; i < ROW_COUNT; i++) {
    const item = lineItems[i];
    if (item) {
      const productNumber = (item.retailerName && item.retailerName !== item.name)
        ? item.retailerName
        : item.sku;
      itemRows.push([
        { text: String(i + 1), alignment: 'center' },
        { text: String(item.quantity), alignment: 'center' },
        { text: String(item.quantity), alignment: 'center' },
        { text: item.name, alignment: 'center' },
        { text: productNumber, alignment: 'center' },
      ]);
    } else {
      itemRows.push([
        { text: ' ' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
      ]);
    }
  }

  return {
    pageSize: 'LETTER',
    pageMargins: [36, 22, 36, 22],
    defaultStyle: { fontSize: 9, lineHeight: 1.1 },
    images: { logo: logoDataUrl },
    content: [
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Packing List', fontSize: 24, margin: [0, 0, 0, 8] },
              {
                columns: [
                  {
                    width: '*',
                    stack: [
                      { text: 'Honeydew Sleep', bold: true },
                      { text: '4670 Calle Carga Ste. A,' },
                      { text: 'Camarillo, CA 93012' },
                      { text: '(805) 657-5768 | jonathan@honeydewsleep.com', margin: [0, 6, 0, 0] },
                    ],
                  },
                  buildCustomerStack(shipTo),
                ],
                columnGap: 24,
              },
            ],
          },
          {
            width: 110,
            image: 'logo',
            fit: [110, 110],
          },
        ],
      },

      {
        margin: [0, 8, 0, 0],
        table: {
          widths: [86, 86, '*', 142],
          body: [
            [colHeader('Order Date'), colHeader('Ship Date'), colHeader(''), colHeader('Customer PO Number')],
            [
              fillCell(formatDate(orderDate)),
              fillCell(formatDate(shipDate)),
              { text: '' },
              fillCell(poNumber || ''),
            ],
          ],
        },
        layout: thinBlackLayout(),
      },

      {
        margin: [0, 8, 0, 0],
        table: {
          headerRows: 1,
          widths: [54, 65, 65, '*', 130],
          body: [
            [
              colHeader('Line Item'),
              colHeader('Quantity\nOrdered'),
              colHeader('Quantity\nShipped'),
              colHeader('Description'),
              colHeader('Product Number'),
            ],
            ...itemRows,
          ],
        },
        layout: thinBlackLayout(),
      },

      {
        table: {
          widths: [86, 86, 97, '*'],
          body: [
            [
              colHeader('Total Ordered'),
              colHeader('Total Shipped'),
              colHeader('Total\nBackordered'),
              { text: 'Shipment Notes:', fillColor: BLUE, bold: true, alignment: 'left' },
            ],
            [
              { text: String(totalOrdered), alignment: 'center' },
              { text: String(totalOrdered), alignment: 'center' },
              { text: '0', alignment: 'center' },
              { text: '' },
            ],
          ],
        },
        layout: thinBlackLayout(),
      },

      {
        margin: [0, 8, 0, 0],
        table: {
          widths: ['*'],
          body: [
            [colHeader('Additional Notes')],
            [{ text: notes || '', alignment: 'left', margin: [2, 4, 2, 4] }],
          ],
        },
        layout: thinBlackLayout(),
      },

      {
        margin: [0, 14, 0, 0],
        stack: [
          { text: 'RECEIVED BY:', bold: true, margin: [0, 0, 0, 10] },
          {
            columns: [
              {
                width: '*',
                stack: [
                  { canvas: [{ type: 'rect', x: 0, y: 0, w: 150, h: 14, color: YELLOW, lineColor: '#000', lineWidth: 0 }] },
                  { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 0.7 }], margin: [0, 0, 0, 2] },
                  { text: 'PRINT NAME', fontSize: 8 },
                ],
              },
              {
                width: '*',
                stack: [
                  { canvas: [{ type: 'rect', x: 0, y: 0, w: 200, h: 14, color: YELLOW, lineColor: '#000', lineWidth: 0 }] },
                  { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.7 }], margin: [0, 0, 0, 2] },
                  { text: 'SIGN NAME', fontSize: 8 },
                ],
              },
              {
                width: '*',
                stack: [
                  { canvas: [{ type: 'rect', x: 0, y: 0, w: 120, h: 14, color: YELLOW, lineColor: '#000', lineWidth: 0 }] },
                  { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 120, y2: 0, lineWidth: 0.7 }], margin: [0, 0, 0, 2] },
                  { text: 'DATE', fontSize: 8 },
                ],
              },
            ],
            columnGap: 20,
          },
        ],
      },
    ],
  };
}

async function buildPdfDoc(input) {
  const logoDataUrl = await getLogoDataUrl();
  const docDef = buildPackingListDocDef({ ...input, logoDataUrl });
  return pdfMake.createPdf(docDef);
}

export async function downloadPackingListPdf(input) {
  const pdf = await buildPdfDoc(input);
  const filename = `Packing-List-${input.poNumber || 'PO'}.pdf`;
  pdf.download(filename);
}

export async function getPackingListPdfBase64(input) {
  const pdf = await buildPdfDoc(input);
  return await pdf.getBase64();
}
