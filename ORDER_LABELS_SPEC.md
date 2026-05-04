# Order Labels — Design Spec

Branch: `feat/order-labels`
Status: design agreed, not yet implemented
Last updated: 2026-04-28

## What this is

B2B "order labels" are stickers that go on the outside of pallet boxes shipped
to retailers. Today they're made manually. This feature auto-generates them
from existing PO data, the same way the packing list (`feat/packing-list-pdf`)
does.

A reference label is in the repo root: `1- QNGP.pdf` (gitignored).

## Visual layout (from the reference PDF)

4×6" landscape page. From top to bottom:

```
┌──────────────────────────────────────────────────┐
│             PO# 135353                           │  ← huge bold
│                                                  │
│  HON-QNSSPSPC                CASE OF 6           │  ← retailer SKU left,
│                                                  │     case size right
│   ┌──────────┐              ┌─────────────┐      │
│   │honeydew  │              │ ║║║║║║║║║║║ │      │  ← logo + UPC-A barcode
│   │  logo    │              │ 8 11584 03051 8│   │
│   └──────────┘              └─────────────┘      │
│                                                  │
│        DELIVER ON: 07/16/2025                    │
└──────────────────────────────────────────────────┘
```

## Data sources

Each label needs:

| Field          | Source                                                                |
|----------------|-----------------------------------------------------------------------|
| PO Number      | POForm — already collected                                            |
| Retailer SKU   | `item.retailerName` if `!== item.name`, else fall back to master SKU  |
| CASE OF *N*    | Computed (see [Case-size logic](#case-size-logic))                    |
| Logo           | `src/assets/packing-list-logo.jpeg` — already imported & cached       |
| UPC barcode    | NEW — stored on each master SKU in `po-config.json` (see below)       |
| Deliver On     | NEW form field — `deliverByDate`                                      |

## Case-size logic

A "case" is one cardboard carton. For a given line item, given quantity `qty`
and `caseSize`:

- `qty <= caseSize` → **1 label**, `CASE OF qty`
  - e.g. 3 queens → one label that says `CASE OF 3`
- `qty` is exact multiple of `caseSize` → **1 label**, `CASE OF caseSize`
  - e.g. 12 queens (caseSize 6) → one label `CASE OF 6`
  - e.g. 8 kings (caseSize 4) → one label `CASE OF 4`
  - The label represents the *carton type*, not the carton count. Warehouse
    knows to make as many as needed.
- `qty` has a remainder → **2 labels**: one `CASE OF caseSize` + one
  `CASE OF remainder`
  - e.g. 9 kings (caseSize 4) → label `CASE OF 4` + label `CASE OF 1`
  - e.g. 14 queens (caseSize 6) → label `CASE OF 6` + label `CASE OF 2`

So **at most 2 labels per line item**.

### Case-size resolution (per master SKU)

1. If the master SKU has an explicit `caseSize` field in `po-config.json`,
   use that. (Editable in AdminPanel → Master SKUs.)
2. Otherwise, run the heuristic on the master SKU string (case-insensitive):
   - contains `queen`, `qn`, or `tr` → **6**
   - contains `king`, `kg`, or `body` → **4**
   - none of the above → fall back to the order qty (single label, no leftover)
3. Per-SKU override always wins over the heuristic.

The `tr` and `body` rules come from real product behavior:
- Travel pillows (`TR`, `SLPC-TR`, `PPP-TR`, `SILK-PSPC-TR`, etc.) ship 6/case
  like queens.
- Body pillows (`BODY`, `HDBODYPC-*`, etc.) ship 4/case like kings.

## UPC / barcode

- Each master SKU gets a `upc` field in `po-config.json` (string, 12 digits,
  UPC-A format). Editable in AdminPanel → Master SKUs.
- All Honeydew UPCs start with the GS1 prefix `81158403` (manufacturer prefix
  `081158403`). Same UPC across all retailers — never per-retailer.
- Rendered with **bwip-js** as a PNG data URL, embedded into pdfmake the same
  way the logo is.
- If a line item's master SKU has **no UPC stored**, label generation is
  blocked. A modal lists the offending master SKUs and a link to AdminPanel.

### Initial UPC import

`master_sku_upc.csv` (gitignored, in repo root) maps 22 master SKUs to UPCs.
Hand-built from real labels. Import once into `po-config.json`.

**Known fix to apply during import:**
- `SILK-PSPC-SS-KG = 811584030426` (CSV row 9, correct)
- CSV row 36 mislabels `SILK-PSPC-SS-KG = 811584030921`. The `...0921` UPC
  actually belongs to `SILK-PSPC-CS-KG` (Classic variant, not Side Sleeper).
  Verified against the GS1 export. Drop row 36's mapping; do not import it.

### Verification reference (do not import from)

`April2026Barcodes.xlsx` (gitignored) is the **GS1 export** — 128 rows, one
per real Honeydew product Honeydew owns the UPC for. Authoritative source of
truth for which UPCs exist and which product they describe.

Do **not** auto-import from this file. Its `SKU` column uses different naming
than `po-config.json` (e.g. `QNGP / QNSS-PSPC` instead of `SSGP-QN`), so a
join would require fuzzy product-description matching. Instead: when a UPC is
added to a master SKU (via import or AdminPanel), look it up in this file and
sanity-check the product description matches what the master SKU represents.

## Deliver-by date

- New form field on POForm: `deliverByDate`. Optional in the form. Renders blank
  on the label if missing.
- Place it next to the existing Order Date field.

## Generation triggers

Two ways to produce labels:

1. **"Download Order Labels" button** — sits next to Download PL. Generates
   one PDF containing all labels for the current order (one label per page),
   downloads locally for printing.
2. **"Send PL to Asana" button** — already exists. After this change, in
   addition to the packing list and optional user attachment, it uploads
   **each label as its own Asana attachment**. Naming convention:
   `Label - PO {number} - {retailerSku} - {caseOf}.pdf`
   (e.g. `Label - PO 135353 - HON-QNSSPSPC - CASE OF 6.pdf`).

## Pre-flight check

Before generating labels (either button), validate every line item has a UPC
on its master SKU. If any are missing:

- Modal pops up: *"Cannot generate order labels — the following master SKUs
  are missing UPCs: [list]. Add them in AdminPanel → Master SKUs."*
- Cancel-only (no "proceed anyway").
- Applies to both the Download button **and** Send PL to Asana — Asana submit
  is also blocked, since labels are now part of that flow.

## Files to touch

- `src/orderLabel.js` — **new**. pdfmake doc-def builder + bwip-js for
  barcode. Exports `buildOrderLabelDocDefs`, `downloadOrderLabelsPdf`,
  `getOrderLabelPdfsBase64` (returns array, one entry per label).
- `src/POForm.jsx` — add Deliver By field, Download Order Labels button,
  pre-flight UPC check modal, plumb labels into Send-to-Asana payload.
- `src/AdminPanel.jsx` — add UPC and Case Size editable columns to Master
  SKUs table.
- `src/api.js` — payload schema gains `orderLabelsBase64: string[]` and
  `orderLabelFilenames: string[]`.
- `google-apps-script.js` — `create_asana_task_with_attachment` handler loops
  over `orderLabelsBase64` and uploads each as a separate attachment to the
  same task. **Surgical patch only** — don't paste full file (live Code.gs
  has real CONFIG values).
- `po-config.json` — every master SKU gains optional `upc` and `caseSize`
  fields. Bulk-import the 22 from `master_sku_upc.csv`.
- `package.json` — add `bwip-js` dependency.

## pdfmake gotchas (carry-overs from packing list)

- `pdf.getBase64()` is **async/Promise-based** in pdfmake v0.3.7. Always
  `await` it. The callback form silently hangs forever.
- `vfs` is set up at module load via `pdfMake.addVirtualFileSystem(pdfFonts)`.
  Default font Roboto is bundled.
- pdfmake needs **data URLs**, not bare URLs, for images. The barcode PNG
  from bwip-js comes back as a base64 data URL — drop in directly.

## Bundle size note

bwip-js adds ~150 KB. With pdfmake already at ~1.6 MB, total bundle stays
acceptable for an internal tool. If first-load matters later, code-split via
dynamic `import()` of both packing-list and order-label modules.

## Open questions deferred to implementation

- **Sticker physical size**: defaulted to 4×6" landscape until confirmed
  against actual label stock. May change after first print test.
- **Per-retailer UPC overrides**: deliberately not built. All evidence shows
  UPCs are Honeydew-owned and identical across retailers. If a private-label
  retailer ever requires their own UPC, add `upcOverrides: { retailerId }` on
  the master SKU — additive change.

## Implementation order

1. Add `bwip-js`, build `src/orderLabel.js` with hardcoded test data, render
   one label and visually compare to `1- QNGP.pdf`.
2. Wire UPC + caseSize into `po-config.json` schema; run the import script.
3. AdminPanel UI for editing UPC + caseSize.
4. POForm: Deliver By field + pre-flight modal + Download Order Labels button.
5. Asana flow: GAS-side multi-attachment loop + frontend payload changes.
6. End-to-end test with a real PO containing a remainder line (e.g. 9 kings)
   to verify the 2-label split works.
