import { readFileSync } from 'node:fs';
import { resolveCaseSize, computeLabelsForLineItems, findMissingUpcs } from '../src/orderLabelLogic.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ${GREEN}✓${RESET} ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ${RED}✗${RESET} ${name}`);
    console.log(`    ${RED}${err.message}${RESET}`);
    failed++;
    failures.push({ name, err });
  }
}

function suite(name, fn) {
  console.log(`\n${BOLD}${name}${RESET}`);
  fn();
}

function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label ? label + ': ' : ''}expected ${e}, got ${a}`);
  }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// ---------- resolveCaseSize ----------

suite('resolveCaseSize — heuristics & overrides', () => {
  test('queen substring → 6', () => {
    eq(resolveCaseSize({ sku: 'PSPC-CS-QUEEN' }, 10), 6);
  });
  test('qn substring → 6 (e.g. SSGP-QN)', () => {
    eq(resolveCaseSize({ sku: 'SSGP-QN' }, 10), 6);
  });
  test('tr substring → 6 (travel pillows)', () => {
    eq(resolveCaseSize({ sku: 'TR' }, 10), 6);
    eq(resolveCaseSize({ sku: 'SLPC-TR' }, 10), 6);
  });
  test('king substring → 4', () => {
    eq(resolveCaseSize({ sku: 'PSPC-CS-KING' }, 10), 4);
  });
  test('kg substring → 4 (e.g. SSGP-KG)', () => {
    eq(resolveCaseSize({ sku: 'SSGP-KG' }, 10), 4);
  });
  test('body substring → 4', () => {
    eq(resolveCaseSize({ sku: 'BODY' }, 10), 4);
    eq(resolveCaseSize({ sku: 'HDBODYPC-PS' }, 10), 4);
  });
  test('no match → fall back to qty', () => {
    eq(resolveCaseSize({ sku: 'HDLB-LAV' }, 7), 7);
    eq(resolveCaseSize({ sku: 'SLYMI-30DAYS' }, 24), 24);
  });
  test('explicit caseSize overrides heuristic', () => {
    eq(resolveCaseSize({ sku: 'SSGP-QN', caseSize: 12 }, 10), 12);
    eq(resolveCaseSize({ sku: 'BODY', caseSize: 2 }, 10), 2);
  });
  test('caseSize=0 ignored, falls through to heuristic', () => {
    eq(resolveCaseSize({ sku: 'SSGP-QN', caseSize: 0 }, 10), 6);
  });
  test('case-insensitive match', () => {
    eq(resolveCaseSize({ sku: 'ssgp-qn' }, 10), 6);
    eq(resolveCaseSize({ sku: 'Body' }, 10), 4);
  });
  test('null/missing master uses qty', () => {
    eq(resolveCaseSize(null, 5), 5);
    eq(resolveCaseSize({ sku: '' }, 5), 5);
  });
});

// ---------- computeLabelsForLineItems ----------

const masters = [
  { sku: 'SSGP-QN', name: 'queen pillow', upc: '811584030518' },
  { sku: 'SSGP-KG', name: 'king pillow', upc: '811584030525' },
  { sku: 'BODY', name: 'body pillow', upc: '811584030051' },
  { sku: 'TR', name: 'travel pillow', upc: '811584030020' },
  { sku: 'HDLB', name: 'lip balm', upc: '811584031089' }, // no qn/kg/tr/body — falls to qty
  { sku: 'CUSTOM', name: 'custom', upc: '999999999999', caseSize: 3 },
  { sku: 'NOUPC', name: 'no upc' }, // no upc field
];

suite('computeLabelsForLineItems — case-size split rules', () => {
  test('3 queens → 1 label CASE OF 3 (qty < caseSize)', () => {
    const out = computeLabelsForLineItems(
      [{ sku: 'SSGP-QN', name: 'queen pillow', quantity: 3 }], masters);
    eq(out.length, 1, 'label count');
    eq(out[0].caseOf, 3);
  });

  test('12 queens → 1 label CASE OF 6 (exact multiple)', () => {
    const out = computeLabelsForLineItems(
      [{ sku: 'SSGP-QN', name: 'queen pillow', quantity: 12 }], masters);
    eq(out.length, 1);
    eq(out[0].caseOf, 6);
  });

  test('8 kings → 1 label CASE OF 4 (exact multiple)', () => {
    const out = computeLabelsForLineItems(
      [{ sku: 'SSGP-KG', name: 'king pillow', quantity: 8 }], masters);
    eq(out.length, 1);
    eq(out[0].caseOf, 4);
  });

  test('9 kings → 2 labels: CASE OF 4 + CASE OF 1', () => {
    const out = computeLabelsForLineItems(
      [{ sku: 'SSGP-KG', name: 'king pillow', quantity: 9 }], masters);
    eq(out.length, 2);
    eq(out[0].caseOf, 4);
    eq(out[1].caseOf, 1);
  });

  test('14 queens → 2 labels: CASE OF 6 + CASE OF 2', () => {
    const out = computeLabelsForLineItems(
      [{ sku: 'SSGP-QN', name: 'queen pillow', quantity: 14 }], masters);
    eq(out.length, 2);
    eq(out[0].caseOf, 6);
    eq(out[1].caseOf, 2);
  });

  test('1 queen → 1 label CASE OF 1 (boundary)', () => {
    const out = computeLabelsForLineItems(
      [{ sku: 'SSGP-QN', name: 'queen pillow', quantity: 1 }], masters);
    eq(out.length, 1);
    eq(out[0].caseOf, 1);
  });

  test('6 queens (exactly caseSize) → 1 label CASE OF 6', () => {
    const out = computeLabelsForLineItems(
      [{ sku: 'SSGP-QN', name: 'queen pillow', quantity: 6 }], masters);
    eq(out.length, 1);
    eq(out[0].caseOf, 6);
  });

  test('lip balm qty 7 (no heuristic match) → 1 label CASE OF 7', () => {
    const out = computeLabelsForLineItems(
      [{ sku: 'HDLB', name: 'lip balm', quantity: 7 }], masters);
    eq(out.length, 1);
    eq(out[0].caseOf, 7);
  });

  test('per-SKU caseSize override, qty 8 with caseSize 3 → CASE OF 3 + CASE OF 2', () => {
    const out = computeLabelsForLineItems(
      [{ sku: 'CUSTOM', name: 'custom', quantity: 8 }], masters);
    eq(out.length, 2);
    eq(out[0].caseOf, 3);
    eq(out[1].caseOf, 2);
  });

  test('multi-line: 12 queens + 9 kings → 3 labels (1 + 2)', () => {
    const out = computeLabelsForLineItems([
      { sku: 'SSGP-QN', name: 'queen pillow', quantity: 12 },
      { sku: 'SSGP-KG', name: 'king pillow', quantity: 9 },
    ], masters);
    eq(out.length, 3);
    eq(out.map((l) => l.caseOf), [6, 4, 1]);
  });

  test('zero qty line item → skipped', () => {
    const out = computeLabelsForLineItems(
      [{ sku: 'SSGP-QN', name: 'queen pillow', quantity: 0 }], masters);
    eq(out.length, 0);
  });

  test('retailerSku used when alias differs from master name', () => {
    const out = computeLabelsForLineItems(
      [{ sku: 'SSGP-QN', name: 'queen pillow', retailerName: 'HON-QNSSPSPC', quantity: 6 }],
      masters);
    eq(out[0].retailerSku, 'HON-QNSSPSPC');
  });

  test('falls back to master sku when retailerName equals master name', () => {
    const out = computeLabelsForLineItems(
      [{ sku: 'SSGP-QN', name: 'queen pillow', retailerName: 'queen pillow', quantity: 6 }],
      masters);
    eq(out[0].retailerSku, 'SSGP-QN');
  });

  test('UPC carried through to label', () => {
    const out = computeLabelsForLineItems(
      [{ sku: 'SSGP-QN', name: 'queen pillow', quantity: 6 }], masters);
    eq(out[0].upc, '811584030518');
  });

  test('label gets empty UPC when master SKU has none', () => {
    const out = computeLabelsForLineItems(
      [{ sku: 'NOUPC', name: 'no upc', quantity: 1 }], masters);
    eq(out[0].upc, '');
  });
});

// ---------- findMissingUpcs ----------

suite('findMissingUpcs — pre-flight check', () => {
  test('returns empty when all line items have a UPC', () => {
    const out = findMissingUpcs([
      { sku: 'SSGP-QN', name: 'queen pillow', quantity: 6 },
      { sku: 'SSGP-KG', name: 'king pillow', quantity: 4 },
    ], masters);
    eq(out, []);
  });

  test('returns the SKUs without a UPC', () => {
    const out = findMissingUpcs([
      { sku: 'SSGP-QN', name: 'queen pillow', quantity: 6 },
      { sku: 'NOUPC', name: 'no upc', quantity: 1 },
    ], masters);
    eq(out, ['NOUPC']);
  });

  test('dedupes when same missing SKU appears twice', () => {
    const out = findMissingUpcs([
      { sku: 'NOUPC', name: 'no upc', quantity: 1 },
      { sku: 'NOUPC', name: 'no upc', quantity: 2 },
    ], masters);
    eq(out, ['NOUPC']);
  });

  test('returns the master SKU even if line item is missing entirely', () => {
    const out = findMissingUpcs([
      { sku: 'NONEXISTENT', name: 'x', quantity: 1 },
    ], masters);
    eq(out, ['NONEXISTENT']);
  });
});

// ---------- po-config.json integrity ----------

suite('po-config.json — UPC import integrity', () => {
  const cfg = JSON.parse(readFileSync(new URL('../po-config.json', import.meta.url), 'utf8'));
  const withUpc = cfg.masterSkus.filter((s) => s.upc);

  test('at least 31 master SKUs have a UPC (post-import)', () => {
    ok(withUpc.length >= 31, `only ${withUpc.length} found`);
  });

  test('every UPC is exactly 12 digits', () => {
    const bad = withUpc.filter((s) => !/^\d{12}$/.test(s.upc));
    eq(bad.map((s) => `${s.sku}=${s.upc}`), [], 'malformed UPCs');
  });

  test('every UPC starts with the Honeydew GS1 prefix 81158403', () => {
    const bad = withUpc.filter((s) => !s.upc.startsWith('81158403'));
    eq(bad.map((s) => `${s.sku}=${s.upc}`), [], 'non-Honeydew UPCs');
  });

  test('SILK-PSPC-SS-KG correctly mapped to ...0426 (not the row-36 typo ...0921)', () => {
    const ss = cfg.masterSkus.find((s) => s.sku === 'SILK-PSPC-SS-KG');
    ok(ss, 'SILK-PSPC-SS-KG missing from config');
    eq(ss.upc, '811584030426');
  });

  test('no two master SKUs share the same UPC', () => {
    const seen = {};
    const dupes = [];
    withUpc.forEach((s) => {
      if (seen[s.upc]) dupes.push(`${s.sku} & ${seen[s.upc]} both = ${s.upc}`);
      else seen[s.upc] = s.sku;
    });
    eq(dupes, []);
  });

  test('all known reference UPCs match their master SKU', () => {
    const expected = {
      'SSGP-QN': '811584030518',
      'SSGP-KG': '811584030525',
      'BODY': '811584030051',
      'TR': '811584030020',
      'ESS-QN': '811584030068',
      'ESS-KG': '811584030600',
    };
    Object.entries(expected).forEach(([sku, upc]) => {
      const m = cfg.masterSkus.find((s) => s.sku === sku);
      ok(m, `${sku} missing`);
      eq(m.upc, upc, sku);
    });
  });
});

// ---------- summary ----------

console.log(`\n${BOLD}─────────────────────────────${RESET}`);
if (failed === 0) {
  console.log(`${GREEN}${BOLD}✓ ${passed} tests passed${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${RED}${BOLD}✗ ${failed} failed${RESET} ${DIM}(${passed} passed)${RESET}`);
  console.log(`\n${BOLD}Failures:${RESET}`);
  failures.forEach((f) => console.log(`  ${RED}✗${RESET} ${f.name}\n    ${f.err.message}`));
  console.log('');
  process.exit(1);
}
