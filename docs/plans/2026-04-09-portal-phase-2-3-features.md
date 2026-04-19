# Portal Phase 2–3 Feature Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four high-impact portal features: Enhanced PDFs, Supplier Price History, Project Tracker, and Gmail Mailbox Monitoring.

**Architecture:** All features build on the existing Express + Firestore + Firebase Hosting stack. Enhanced PDFs modifies only `functions/pdf.js`. Price History and Project Tracker add new Firestore queries + frontend pages. Mailbox Monitoring adds a scheduled Cloud Function that polls Gmail via the existing googleapis dependency.

**Tech Stack:** Node.js 22, Express, Firestore, jsPDF, googleapis (Gmail API), Firebase Cloud Functions v2

---

## Feature 1: Enhanced PDFs

**Estimated effort:** 45 minutes  
**Impact:** Every PDF sent to suppliers looks more professional

### What we're building
- Page numbers ("Page 1 of 2") on every page
- Terms & conditions footer on the last page
- Better line item table spacing

### Task 1.1: Add Page Numbers to PDFs

**Files:**
- Modify: `functions/pdf.js` (the `generatePDF()` function)

- [ ] **Step 1: Add page number rendering after all content is placed**

In `pdf.js`, after the jsPDF document is fully built (after autoTable and notes), add a loop over all pages to stamp "Page X of Y" in the bottom-right corner.

- [ ] **Step 2: Verify by generating a multi-page PDF**

Create or edit a PO with many line items (10+) so it spans 2+ pages. Preview the PDF and confirm page numbers appear bottom-right on each page.

- [ ] **Step 3: Commit**

### Task 1.2: Add Terms & Conditions Footer

**Files:**
- Modify: `functions/pdf.js`

- [ ] **Step 1: Add T&C text on the last page after notes**

After the notes section is rendered, check remaining space. If insufficient, add a new page. Render terms in small gray text with bullet points.

Terms to include:
- All prices are in Canadian dollars unless otherwise specified.
- Payment terms: Net 30 days from date of invoice.
- Delivery dates are estimates and subject to change.
- Western Windows reserves the right to cancel orders with 48 hours notice.
- All materials remain property of Western Windows until installed.

- [ ] **Step 2: Verify terms render on last page**

Preview a PDF and confirm the terms appear below the notes section. Test with both a single-page and multi-page document.

- [ ] **Step 3: Commit**

### Task 1.3: Improve Table Spacing

**Files:**
- Modify: `functions/pdf.js`

- [ ] **Step 1: Adjust autoTable styles for better readability**

Increase cellPadding to 4 (from 2/3), add alternating row colors, increase header padding to 5.

- [ ] **Step 2: Verify improved spacing**

Preview a PDF with 5+ line items. Confirm rows are easier to read.

- [ ] **Step 3: Commit and deploy**

---

## Feature 2: Supplier Price History

**Estimated effort:** 2 hours  
**Impact:** See what you paid last time before quoting — saves time and prevents overpaying

### What we're building
- Backend: New Firestore query that fetches historical prices for a supplier
- API: `GET /api/suppliers/:id/price-history`
- Frontend: Show "Last quoted: $X on DATE" hints below description fields on the form
- Firestore composite index for the query

### Task 2.1: Backend — Price History Query

**Files:**
- Modify: `functions/firestore.js` — add `getSupplierPriceHistory(supplierId)`
- Modify: `functions/routes/suppliers.js` — add GET route

- [ ] **Step 1: Add Firestore query function**

Query documents collection filtered by supplier_id, doc_type in [PO, RFQ], status in non-draft statuses. Order by created_at desc, limit 20. Build a map of product description → most recent price, returning the unique price entries.

- [ ] **Step 2: Add API route**

`GET /api/suppliers/:id/price-history` → returns `{ prices: [...] }`

- [ ] **Step 3: Commit**

### Task 2.2: Firestore Index

**Files:**
- Modify: `firestore.indexes.json`

- [ ] **Step 1: Add composite index** for supplier_id + doc_type + status + created_at

- [ ] **Step 2: Deploy indexes**: `firebase deploy --only firestore:indexes`

- [ ] **Step 3: Commit**

### Task 2.3: Frontend — Price Hints on Form

**Files:**
- Modify: `WW apps/src/portal/js/form.js` — fetch history, show hints
- Modify: `WW apps/src/portal/css/styles.css` — hint styles

- [ ] **Step 1: Fetch price history when supplier is loaded**

Call `/api/suppliers/{id}/price-history` after supplier selection. Store results in a `priceHistory` array.

- [ ] **Step 2: Show price hints when user types a description**

Add debounced handler on line item description fields that searches `priceHistory` for fuzzy matches and shows a styled hint: "Last: $X.XX (PO-2026-0042, Apr 3)"

- [ ] **Step 3: Add CSS for price hints**

Small blue-tinted hint with left border, below the description input.

- [ ] **Step 4: Verify end-to-end**

- [ ] **Step 5: Commit**

---

## Feature 3: Project Tracker

**Estimated effort:** 2 hours  
**Impact:** See all RFQs + POs for a job in one place

### What we're building
- New page: `portal/projects.html` + `portal/js/projects.js`
- Backend: project list + docs-by-project queries
- Dashboard link to Projects view
- Project detail view showing all docs for that project

### Task 3.1: Backend — Project Queries

**Files:**
- Modify: `functions/firestore.js` — add `getProjectList()` and `getDocumentsByProject()`
- Modify: `functions/routes/documents.js` — add project routes

- [ ] **Step 1: Add project query functions**

`getProjectList()` — scan all docs, group by project_name, aggregate counts (RFQ/PO), total value, supplier list, last activity date. Sort by last activity desc.

`getDocumentsByProject(name)` — simple where query on project_name.

- [ ] **Step 2: Add API routes**

`GET /api/documents/projects/list` — returns project summaries.
`GET /api/documents/projects/:name` — returns all docs for that project.

> **Important:** These routes must be defined BEFORE the `/:id` catch-all route.

- [ ] **Step 3: Commit backend**

### Task 3.2: Frontend — Projects Page

**Files:**
- Create: `WW apps/src/portal/projects.html`
- Create: `WW apps/src/portal/js/projects.js`
- Modify: `WW apps/src/portal/css/styles.css`
- Modify: `WW apps/src/portal/dashboard.html`

- [ ] **Step 1: Create projects.html** — standard portal page layout with search bar + project cards grid

- [ ] **Step 2: Create projects.js** — load projects from API, render cards with: project name, supplier chips, doc counts, total value, status badges. Search bar filters by name. Click drills into project detail.

- [ ] **Step 3: Add project card styles** — cards with supplier avatars, status badges, value display

- [ ] **Step 4: Add Projects link to dashboard** — new action card: "Projects — Track docs by job"

- [ ] **Step 5: Verify end-to-end**

- [ ] **Step 6: Commit**

---

## Feature 4: Gmail Mailbox Monitoring

**Estimated effort:** 3 hours  
**Impact:** Auto-detect supplier replies, eliminate manual status updates

### What we're building
- Scheduled Cloud Function (every 15 min) polls Gmail for replies
- Matches incoming emails to sent documents by doc number in subject
- Auto-updates status (Sent → Quoted for RFQs, Sent → Confirmed for POs)
- Saves reply metadata on the document
- Dashboard notification for new supplier responses

### Task 4.1: Gmail API Integration Module

**Files:**
- Create: `functions/gmail.js`

- [ ] **Step 1: Create Gmail polling module**

Using googleapis dependency. Authenticate with service account (same as Drive). Search inbox for replies to info@westernwindows.ca. Parse message headers (From, Subject, Date, References).

- [ ] **Step 2: Add document matching logic**

Match by:
1. Subject line containing doc number (RFQ-YYYY-NNNN or PO-YYYY-NNNN)
2. Sender email matching supplier quote_email or order_email

- [ ] **Step 3: Commit**

### Task 4.2: Scheduled Cloud Function

**Files:**
- Modify: `functions/index.js` — add scheduled function export
- Modify: `functions/firestore.js` — add `updateDocumentReply()` function

- [ ] **Step 1: Add reply metadata storage function**

Stores: reply from, date, subject, snippet, gmail_id, detected_at. Updates status to Quoted (RFQ) or Confirmed (PO).

- [ ] **Step 2: Add scheduled function**

`onSchedule({ schedule: 'every 15 minutes' })` — calls gmail.checkForReplies() and processes matches.

- [ ] **Step 3: Add Gmail API secrets** — OAuth credentials or service account with Gmail scope

- [ ] **Step 4: Test manually** — trigger function, verify polling + matching + status update

- [ ] **Step 5: Commit and deploy**

### Task 4.3: Frontend — Reply Indicators

**Files:**
- Modify: `WW apps/src/portal/js/history.js`
- Modify: `WW apps/src/portal/js/preview.js`
- Modify: `WW apps/src/portal/js/dashboard.js`
- Modify: `WW apps/src/portal/css/styles.css`

- [ ] **Step 1: Show reply indicators on document list** — "Reply received" badge with date

- [ ] **Step 2: Show reply details on preview page** — card with sender, date, snippet

- [ ] **Step 3: Dashboard notification** — "New Responses" count for unreviewed replies

- [ ] **Step 4: Commit**

---

## Deployment Plan

After all features are implemented:

1. Run `build.ps1` to assemble the portal
2. `firebase deploy` for full deploy (functions + hosting + indexes)
3. Verify each feature on production:
   - Generate a multi-page PDF → confirm page numbers + terms
   - Create a PO for a supplier with history → confirm price hints
   - Visit Projects page → confirm project grouping
   - Wait 15 min → confirm mailbox check runs (check Cloud Function logs)

---

## Risk Notes

| Risk | Mitigation |
|------|------------|
| Gmail API auth complexity | Can start with manual "mark as received" toggle and add auto-detection later |
| Price history query performance | Limit to 20 most recent docs, add composite index |
| Project name inconsistency | Exact string match — may need normalization or fuzzy search later |
| Scheduled function cost | Every-15-min polling is ~2,880 invocations/month — well within free tier |
