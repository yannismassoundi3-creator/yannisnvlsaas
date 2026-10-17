**English** · [Français](fr/IMPORTS.md)

# CSV imports

CSV import is Narixia's first data integration. It covers four kinds of data, each with a downloadable
template (Imports → New import → "… template"):

| Kind | One row per | Recognised exports | Required columns |
| --- | --- | --- | --- |
| Orders | order line | Shopify order export | Order number, Order date, Product name, Quantity, Unit price |
| Products and costs | product or variant | Shopify product export (variants named from handle and options) | Product name |
| Advertising spend | campaign and day | Meta, Google Ads and TikTok reports with a daily breakdown | Day, Campaign, Spend |
| Expenses | expense | — | Date, Amount |

Every field, its description and the header names recognised automatically are defined in
`src/lib/imports/schema.ts`. Header matching ignores case, accents, punctuation and text in parentheses
("Amount spent (EUR)" matches "amount spent"), and includes common French headers.

Templates follow the interface language. The French templates use French headers (all recognised automatically),
day/month/year dates, decimal commas and semicolons, so Excel set to French opens them in columns; the English
ones use commas and decimal points. Both are UTF-8 with a BOM and CRLF line ends, and the expense kind is read in
either language ("fixed"/"variable", "fixe"/"variable").

## The pipeline

| # | Step | Where | What happens |
| --- | --- | --- | --- |
| 1 | File selection | Browser | Drag and drop or file picker, `.csv` only. |
| 2 | Type and size validation | Browser | Empty files, files over 25 MB, binary files (e.g. `.xlsx`), unclosed quotes and more than 300 columns are refused with an explanation. UTF-8 is tried first, then Windows-1252 (files saved by Excel). Report titles above the header row (Google Ads) are skipped. |
| 3 | Preview | Browser | The first rows are shown with the detected delimiter and encoding. |
| 4 | Column mapping | Browser | Columns are matched to fields automatically; the user can change any match. Required fields must be mapped. |
| 5 | Normalisation | Browser, then server | Date format (YYYY-MM-DD, DD/MM/YYYY or MM/DD/YYYY), decimal separator, time zone (offset in the file, else the store's), tax-inclusive prices, currency check. |
| 6 | Required-field validation | Browser, then server | Missing or unreadable values become row errors. Nothing is guessed or filled in. |
| 7 | Duplicate detection | Database | Within the file and against existing records (rules below). |
| 8 | Row-level errors | Review page | Every invalid or duplicate row is listed with its row number, field and reason, and can be downloaded as CSV (`/api/imports/[id]/issues`). |
| 9 | Confirmation | Review page | "Nothing has been saved yet": counts of rows to add, update, skip and fix. The user confirms explicitly. |
| 10 | Import history | Imports page | Every import with its date, type, file name, status and counts, plus monthly usage against the plan limit. |
| 11 | Undo | Import page | The latest completed import of a store can be undone (rules below). Records an import created are removed; records it replaced are restored. |
| 12 | Re-import | Database | Re-importing the same file adds nothing by default ("Skip existing"), or replaces existing records ("Update existing"). |

### Privacy by design

The file is read in the browser. Only the cells of the columns the user maps are sent to the server; customer
names, emails and addresses in a Shopify export never leave the user's computer unless mapped (and no field asks
for them).

### Server-side validation

The server never trusts the browser's validation:

- The job is created first with the mapping, options and expected row count; the options stored on the job are
  the ones used for every later step, whatever the browser sends afterwards.
- Rows arrive in chunks of 500 (`stageImportRows`) and are validated again with the same normalisation code
  (`src/lib/imports/normalize.ts`) before they are written to `import_rows` as `valid` or `invalid`.
- Plan limits (rows per file, rows per month) are checked when the job is created and again before committing.
- Every write goes through the user's own session, so Row Level Security applies to every row.

### Duplicate rules (`public.import_finalize`)

| Kind | Identity | Within the file | Already in the store |
| --- | --- | --- | --- |
| Orders | Order number | All lines of an order must be in one upload chunk (the wizard keeps them together). If any line of an order has an error, the whole order is held back: a partial order would understate sales. | Skipped, or replaced as a whole with "Update existing" |
| Products | SKU, else the product name | First occurrence wins; repeats are reported | Skipped, or updated |
| Ad spend | Platform + campaign (ID, else name) + day | First occurrence wins | Skipped, or the day's spend is replaced |
| Expenses | Date + amount + category + kind + description | Identical rows are kept but flagged (two equal purchases can be genuine) | Always skipped |

### Committing

`public.import_commit_batch` commits up to 500 valid rows per call, under a per-store advisory lock, so a large
import never runs into a statement timeout and two imports into the same store cannot interleave. The browser
calls it until no valid rows remain; if the tab closes, the import page offers "Resume import", and rows already
imported are not imported twice. If a batch fails unexpectedly, the import is marked failed and undone, so a failed
import never leaves partial data. Each row is
committed in its own exception block: a row that fails at commit time (for example a constraint violated by a
concurrent edit) is marked invalid with the database's reason instead of aborting the batch.

Order lines are matched to products by SKU, then by name. Unknown products are created automatically, without a
cost, and appear in the "Missing cost" filter of the Products page. A unit cost in the orders file is stored on
the line (a snapshot), so later changes to the product's cost do not rewrite that order.

### Undo (`public.import_rollback`)

- Only the **most recent** completed import of a store can be undone. Undoing an older one could restore records
  that a later import replaced, so it is refused with an explanation.
- Records created by the import are deleted; records it replaced are restored from the copy kept at commit time.
- Products the import created automatically are removed only if they have no cost and no other order lines;
  campaigns only if no spend remains.
- Uploads that were not confirmed can be cancelled. Any finished import can be removed from the history; for a
  completed import the data stays, but it can no longer be undone. Staged rows of uploads abandoned for more than
  two days are removed by the maintenance job.

## Limits

| Limit | Trial | Pro |
| --- | --- | --- |
| Rows per file | 5,000 | 100,000 |
| Imported rows per calendar month | 20,000 | 1,000,000 |

Independent of the plan: 25 MB per file, 300 columns, 2,000 characters per cell, 500 lines per order.
Plan limits are configured in `src/config/plans.ts`.

## Exports and formula injection

Imported text is untrusted. Every CSV produced by Narixia (exports, reports, issue lists) goes through
`escapeCsvCell` (`src/lib/csv.ts`): a cell starting with `=`, `+`, `-`, `@`, tab or carriage return is prefixed
with `'`, so spreadsheet software shows it as text instead of evaluating a formula. Numeric columns are written
as plain numbers (negative amounts are numbers, not text). Files are UTF-8 with a byte-order mark and CRLF line
endings so Excel opens accents correctly.

## Adding a new source later

Platform integrations (Shopify API, Meta, Google Ads) should reuse the same tables and the same normalisation:
produce rows in the shape of `normalize.ts`'s output, stage them in an import job with `source` set to the
integration, and let `import_finalize` / `import_commit_batch` apply duplicate rules and undo. Records already
carry `source` and `import_job_id` columns for that purpose.
