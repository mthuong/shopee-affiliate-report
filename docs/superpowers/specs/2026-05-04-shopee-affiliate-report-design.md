# Shopee Affiliate Report Web App — Design Spec

**Date:** 2026-05-04  
**Status:** Approved

---

## Problem Statement

The user manages a Shopee affiliate program and receives commission from orders placed by their clients. Each month, they capture screenshots from the Shopee app showing individual order details. Currently there is no system to parse, track, assign, or report on this commission data. This app solves that by providing a web-based tool to upload screenshots, auto-parse order data with AI, assign orders to clients, and export commission reports.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, React Server Components) |
| Database | Supabase (Postgres) |
| Image Parsing | Google Gemini 1.5 Flash API (free tier: 1,500 req/day) |
| Deployment | Vercel |
| Export | `xlsx` library (client-side Excel generation) |
| Auth | None (no authentication required) |

---

## Architecture

**Approach: Lightweight — No Image Storage**

Images are uploaded to the browser, sent to Gemini via a Next.js Server Action for parsing, and then discarded. Only the extracted order data is persisted to Supabase. This minimizes storage costs and complexity.

**Data flow:**
1. User creates a monthly report (default name: "May 2026", editable)
2. User uploads N screenshot images into the report
3. User clicks "Parse All" → images are sent in batch to Gemini 1.5 Flash via a server action
4. Gemini returns an array of orders (each image may contain multiple orders)
5. Parsed orders are displayed for review; user can edit any field before saving
6. User assigns completed orders to clients
7. On the Client Detail page, user views orders grouped by report month, adjusts commission %, and exports to Excel

---

## Pages & Routes

| Route | Purpose |
|---|---|
| `/` | Reports List (home) — all monthly report containers |
| `/reports/[id]` | Report Detail — upload images, parse, review/edit orders, assign to clients |
| `/clients` | Clients List — all clients |
| `/clients/[id]` | Client Detail — orders grouped by month, commission settings, export |

---

## Data Model (Supabase / Postgres)

### `order_statuses`
Seed with initial values; extensible without schema changes.

| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| name | TEXT | e.g. "Đã hoàn thành", "Đã hủy" |

**Initial seed:** `1 = "Đã hoàn thành"`, `2 = "Đã hủy"`

### `reports`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | Default: "Month YYYY" (e.g. "April 2026"), user-editable |
| created_at | TIMESTAMPTZ | |

### `clients`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | |
| created_at | TIMESTAMPTZ | |

### `report_clients`
Tracks the commission % for a specific client in a specific report month.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| report_id | UUID FK → reports | |
| client_id | UUID FK → clients | |
| commission_percent | INTEGER | Default: 50 |
| UNIQUE | (report_id, client_id) | |

### `orders`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| report_id | UUID FK → reports | |
| order_id | TEXT | Shopee order code (e.g. "2604282M8582FA") |
| product_name | TEXT | Product name extracted from screenshot (nullable) |
| status_id | INTEGER FK → order_statuses | |
| commission | BIGINT | VND (supports very large values) |
| ordered_at | TIMESTAMPTZ | Date/time from screenshot or user input |
| client_id | UUID FK → clients, nullable | NULL = unassigned |
| is_manual | BOOLEAN | TRUE if manually entered, FALSE if parsed from image |
| created_at | TIMESTAMPTZ | |

---

## UI Design

### Reports List (`/`)
- Cards showing: report name, order count, total commission
- **Hover** a card → ✏️ Rename and 🗑 Delete buttons appear
- Rename: modal with text input
- Delete: confirmation modal showing how many orders will be deleted (irreversible)
- "+" New Report button (top right)
- All-time commission total at the bottom

### Report Detail (`/reports/[id]`)
- Report name displayed at top (editable via Rename action)
- Upload area (always visible — drag & drop or click to select files; supports adding more images to an existing report anytime)
- "Parse All (N images)" button — sends all images to Gemini in batch
- Parse failures: show failed image names with individual retry buttons; successfully parsed orders are kept
- Orders table: Order ID, Product Name, Date, Status (displays status_name), Commission, Client (assigned or "—")
- Hover row → 🗑 delete button appears; click row → edit modal
- Edit modal fields: Order ID, Product Name, Status (dropdown), Commission (₫), Order Date, Client (dropdown of all clients + "Unassigned" option to set `client_id` back to NULL)
- "Add Order Manually" button — opens same modal with empty fields, date defaults to today
- Duplicate order ID detection: skip duplicate, show warning banner

### Clients List (`/clients`)
- Cards showing: client name, total commission across all months, total commission return
  - **Total commission return formula (Clients List):** Sum of `floor(o.commission * rc.commission_percent / 100)` for all completed orders assigned to this client, joined through `report_clients` for the correct per-report `commission_percent`.
- "+" New Client button
- Click card → Client Detail

### Client Detail (`/clients/[id]`)
- Large client name header
- Summary cards: Total Commission (all months) + Total Commission Return (all months)
- Orders grouped by report month, sorted newest first
- Per-month section header: month name + commission % text input (number, 0–100) + Save button + 📥 Export button
- Commission % save writes to `report_clients.commission_percent`; subtotal/return recalculates live on input
- Orders table per month: Order ID, Product Name, Date, Status (status_name), Commission
  - Hover row → 🗑 delete button appears (with confirmation)
  - Click row cells → edit modal (same fields as report detail)
- "Add Order Manually" button per month section
- Per-month subtotal: "Subtotal: ₫X → Return: ₫Y"
  - **Commission Return formula:** `return = floor(commission * commission_percent / 100)`, applied per order then summed for the subtotal. Displayed in VND (integer, no decimals).
- **`report_clients` row creation:** A `report_clients` row is created automatically the first time an order is assigned to a client within a report (with `commission_percent` defaulting to 50). The row is reused for all subsequent assignments of the same client to the same report.

---

## Image Parsing (Gemini)

- **API key:** `GEMINI_API_KEY` environment variable (server-side only, never exposed to client)
- **Trigger:** User clicks "Parse All" in a report
- **Request:** All uploaded images sent in a single batch to Gemini 1.5 Flash via a Next.js Server Action
- **Prompt:** Instructs Gemini to extract all orders from the images, returning structured JSON:
  ```json
  [{ "order_id": "...", "product_name": "...", "status_name": "...", "commission_vnd": 6630, "ordered_at": "2026-04-24T15:47:00" }]
  ```
- **`status_name` mapping:** After parsing, the server matches the returned `status_name` string (exact match, case-insensitive) against `order_statuses.name`. If no match is found, a new row is inserted into `order_statuses` with that name, and the new `id` is used. This ensures extensibility without data loss.
- **Batch size limit:** Images are sent in chunks of at most 10 per Gemini request to avoid context/token limits. If a report has more than 10 images, the server action sends multiple sequential requests and merges results.
- **Multiple orders per image:** Supported — Gemini may return multiple orders from a single screenshot.
- **On success:** Parsed orders appear in a "pending review" section above the saved orders table. The user can edit any field inline, then click "Save All" to persist them to the DB. Until saved, they are held in component state only.
- **On failure:** Show which images failed; user can retry individual images; successfully parsed orders are unaffected.

---

## Excel Export

- Generated client-side using the `xlsx` library (no server round-trip)
- Triggered per month from the Client Detail page
- Columns: Order ID, Product Name, Date (formatted as `DD-MM-YYYY HH:mm`), Status, Commission (₫), Commission Return (₫)
- Filename: `<client_name>_<report_name>.xlsx`

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Gemini parse failure (single image) | Show failed image name, retry button; keep other parsed orders |
| Gemini parse failure (all images) | Show error banner with retry all button |
| Duplicate order ID in same report | Skip duplicate, show warning: "X orders skipped (already exist)" |
| Supabase connection error | Show toast notification; no data loss (form data preserved) |
| Commission % out of range | Clamp to 0–100, show inline validation message |

---

## GitHub Repository

- Owner: `mthuong`
- Create new public repository: `shopee-affiliate-report`
- Deploy to Vercel connected to this repository

---

## Out of Scope

- User authentication
- Multi-user / team access
- Re-processing already-saved images (images not stored)
- Mobile app
