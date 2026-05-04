export function resolveCaseSize(masterSku, qty) {
  if (masterSku?.caseSize && Number(masterSku.caseSize) > 0) {
    return Number(masterSku.caseSize);
  }
  const s = (masterSku?.sku || '').toLowerCase();
  if (s.includes('queen') || s.includes('qn') || s.includes('tr')) return 6;
  if (s.includes('king') || s.includes('kg') || s.includes('body')) return 4;
  return qty;
}

export function computeLabelsForLineItems(lineItems, masterSkus) {
  const labels = [];
  lineItems.forEach((item) => {
    const master = masterSkus.find((s) => s.sku === item.sku);
    const qty = Number(item.quantity) || 0;
    if (qty <= 0) return;
    const caseSize = resolveCaseSize(master, qty);
    const upc = master?.upc || '';
    const retailerSku = (item.retailerName && item.retailerName !== item.name)
      ? item.retailerName : item.sku;

    if (qty <= caseSize) {
      labels.push({ retailerSku, caseOf: qty, upc, masterSku: item.sku });
    } else if (qty % caseSize === 0) {
      labels.push({ retailerSku, caseOf: caseSize, upc, masterSku: item.sku });
    } else {
      labels.push({ retailerSku, caseOf: caseSize, upc, masterSku: item.sku });
      labels.push({ retailerSku, caseOf: qty % caseSize, upc, masterSku: item.sku });
    }
  });
  return labels;
}

export function findMissingUpcs(lineItems, masterSkus) {
  const missing = new Set();
  lineItems.forEach((item) => {
    const master = masterSkus.find((s) => s.sku === item.sku);
    if (!master?.upc) missing.add(item.sku);
  });
  return Array.from(missing);
}
