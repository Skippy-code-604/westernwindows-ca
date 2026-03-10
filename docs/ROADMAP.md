# WW Portal — Feature Roadmap & Task Graph

> **Last updated:** 2026-03-09
> **Branch:** `feature/migrate-to-domain`
> **Live at:** [westernwindows.ca/portal](https://westernwindows.ca/portal)

---

## Current Architecture

```
westernwindows.ca/              → Landing page (static HTML)
westernwindows.ca/portal/       → Supplier portal (Firebase Auth + SPA)
westernwindows.ca/api/**        → Cloud Functions v2 (Express, Node 22)
```

**Stack:** Firebase Hosting · Cloud Functions v2 · Firestore · Cloud Storage · Google Drive API · Nodemailer (SMTP)

**Pages:** Login → Dashboard → Select Supplier → Form → Preview → History → Compare Quotes

---

## ✅ Shipped Features

### Core Document Workflow
- [x] RFQ creation with supplier-specific line item fields (glass vs windows & doors)
- [x] PO creation with unit pricing and line totals
- [x] Auto-incrementing document numbers (`RFQ-2026-NNNN`, `PO-2026-NNNN`)
- [x] PDF generation (jsPDF + AutoTable)
- [x] Email sending via SMTP (Nodemailer)
- [x] PDF preview in-browser before sending
- [x] Document search/filter (type, supplier, status, date range, keyword)
- [x] Edit existing documents
- [x] Delete documents
- [x] Order confirmation tracking (POs)

### Supplier Management
- [x] 6 suppliers seeded (3 glass, 3 windows & doors)
- [x] Supplier-specific form fields (Garibaldi vs Hartung vs OBE, Gentek vs Modern)
- [x] Supplier card selection UI with type grouping

### Multi-Supplier RFQ (Competitive Bidding)
- [x] Select multiple suppliers via checkbox cards
- [x] Single form creates batch of RFQs (one per supplier)
- [x] Batch preview with "Send All" button
- [x] Batch email sending (parallel)
- [x] `batch_group` field links related documents

### RFQ → PO Conversion
- [x] One-click "Convert to PO" on sent RFQ preview page
- [x] Copies line items with quoted prices
- [x] Links PO back to source RFQ via `quote_reference`

### Quote Comparison
- [x] Side-by-side price entry table (suppliers as columns)
- [x] Per-line cheapest highlighting (green)
- [x] Overall cheapest supplier total highlighting
- [x] Save prices back to Firestore
- [x] "Convert Winner to PO" button
- [x] Accessible from documents list (📊 button on batch RFQs)

### Google Drive Auto-Export
- [x] PDFs auto-uploaded to Drive on send
- [x] Folder hierarchy: `Year / Month / Project Name / filename.pdf`
- [x] JWT auth with dedicated service account
- [x] Non-blocking (Drive failure doesn't break email send)

### Infrastructure
- [x] Domain consolidation (landing page + portal on `westernwindows.ca`)
- [x] Firebase Hosting with API rewrites (no CORS needed)
- [x] Firebase Authentication (Google Sign-In)
- [x] Cloud Secrets for SMTP credentials
- [x] Security audit + XSS prevention + input validation
- [x] Node.js 22 runtime

---

## 🔧 Known Issues & Bugs

> Fix these before building new features.

| # | Issue | Severity | Effort |
|---|-------|----------|--------|
| B1 | **Google Places API key** — `RefererNotAllowedMapError` on `westernwindows.ca`. Key needs domain added in GCP Console → Credentials → Website restrictions. | 🔴 High | 5 min (manual) |
| B2 | **Firebase Storage** not configured for `western-windows-ca` project. Deploy with `--only storage` fails. Doesn't block current functionality but limits future features. | 🟡 Medium | 15 min (manual) |
| B3 | **Old batch RFQs missing `batch_group`** — Documents created before the fix don't have the field. Compare button won't appear for them. Could backfill via Firestore console or a one-time migration script. | 🟡 Medium | 15 min |
| B4 | **Deploy cold start timeouts** — Intermittent `User code failed to load. Timeout after 10000` on deploy. Retry usually works. Root cause: googleapis package is heavy at import time. | 🟡 Medium | 30 min |
| B5 | **`convertToPO` double-parses response** — The `convertToPO` function in `preview.js` calls `res.json()` twice (once for error check, once for data). Second call will fail. | 🔴 High | 5 min |

---

## 📋 Phase 1 — Quick Wins (High ROI, Low Effort)

> Things that take under an hour and immediately improve daily workflow.

- [ ] **B1: Fix Google Places API key** — Add `westernwindows.ca` to allowed referrers
- [ ] **B5: Fix convertToPO double json parse** — Single parse, check structure
- [ ] **Dashboard quick stats** — Show counts: drafts pending, RFQs awaiting response, POs this month
- [ ] **Duplicate document** — "Copy as new" button on any document to prefill a new form
- [ ] **Default "Requested By"** — Remember last used name in localStorage instead of hardcoding "Shane"

---

## 📋 Phase 2 — Workflow Improvements (High ROI, Medium Effort)

> Features that save real time on a weekly basis.

- [ ] **Status tracking pipeline** — Visual pipeline: Draft → Sent → Quoted → Ordered → Delivered. Update status from document list without opening preview. Dashboard shows pipeline counts.
- [ ] **Email response tracking** — Log when supplier replies (manual toggle or email parsing). Show "Awaiting Response" / "Quote Received" badges.
- [ ] **Document templates** — Save a filled form as a template (e.g. "Standard shower glass RFQ"). Select template on new document to prefill line items.
- [ ] **Bulk actions on document list** — Checkbox select + "Delete selected" / "Export selected" / "Change status"
- [ ] **Enhanced PDF** — Company logo on PDF header, better formatting, page numbers, terms & conditions footer

---

## 📋 Phase 3 — Business Intelligence (Medium ROI, Medium Effort)

> See the bigger picture — spending, supplier performance, project tracking.

- [ ] **Supplier price history** — Track quoted prices over time per supplier per product. "Last quoted price" shown on form when creating new RFQ for same supplier.
- [ ] **Monthly spend report** — Total PO value by supplier, by month. Simple bar chart on dashboard.
- [ ] **Project tracker** — Group all documents (RFQs + POs) by project name. See full procurement history for a job in one view.
- [ ] **Export to CSV/Excel** — Download filtered document list as spreadsheet

---

## 📋 Phase 4 — Advanced Features (Medium ROI, Higher Effort)

> Nice-to-haves that add polish and power.

- [ ] **Supplier portal (read-only)** — Suppliers get a link to view their RFQ and submit pricing directly. Eliminates email back-and-forth for quotes.
- [ ] **Recurring orders** — "Reorder" button creates new PO from a previous one. Useful for standard stock items.
- [ ] **Multi-user support** — Multiple team members with role-based access (admin vs viewer). Activity log tracking who sent what.
- [ ] **Mobile-optimized form** — Responsive line item fields for tablet use on job sites
- [ ] **Notification system** — Email/browser notifications for status changes, overdue RFQs, delivered POs

---

## 📋 Phase 5 — Integration & Scale (Lower Priority)

> Long-term infrastructure improvements.

- [ ] **QuickBooks / accounting sync** — Push POs to accounting software
- [ ] **Inventory awareness** — Track what's on order vs received. Receiving confirmation workflow.
- [ ] **AI-powered suggestions** — Auto-suggest glass specs based on project type. Flag unusual pricing.
- [ ] **Backup & disaster recovery** — Automated Firestore exports, Drive backup verification

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-07 | Consolidate landing page + portal on single Firebase project | Simpler infrastructure, one deploy, one domain |
| 2026-03-07 | JWT auth for Drive (not domain-wide delegation) | More secure, dedicated SA key stored in secrets |
| 2026-03-08 | `batch_group` as comma-separated supplier IDs | Simple, no additional collection needed |
| 2026-03-08 | Compare page uses document IDs from URL params | Stateless — works from batch preview or documents list |
| 2026-03-09 | Roadmap organized by ROI, not technical domain | Business value drives priority, not engineer preference |

---

## How To Use This Document

1. **Before starting work** — check Phase 1 bugs first, then pick from the highest-priority unchecked item
2. **After shipping** — check the box, add to "Shipped Features", update date
3. **New ideas** — add to the appropriate phase based on ROI vs effort
4. **Each session** — reference this doc to stay focused on what matters
