# Email Response Tracking — Design Document

> **Date:** 2026-03-10
> **Status:** Approved
> **Roadmap:** Phase 2 — Workflow Improvements

---

## Problem

After sending RFQs or POs to suppliers, there's no way to know which ones have responded without manually checking Gmail. With 6 suppliers and multiple active documents, this creates daily friction.

## Solution

Automated Gmail polling that detects supplier responses by matching PDF-bearing emails to open portal documents. Combines automatic detection with manual override.

---

## Architecture

### Flow

```
[Scheduled Cloud Function — every 15 min]
        |
        v
[Gmail API — search supplier domains, PDF attachments, last 7 days]
        |
        v
[Match Engine]
   ├── Tier 1: Doc number in subject/body (RFQ-2026-NNNN / PO-2026-NNNN) → direct match
   ├── Tier 2: Project name / job address in subject/body → match to open Sent docs for that supplier
   └── Tier 3: Supplier domain + open Sent doc → suggest match
        |
        v
[Update Firestore document: response_status, response_date, response_email_from]
        |
        v
[Dashboard + History page show updated badges]
```

### Gmail Query Strategy

```
from:(bbyquotes@hartung-glass.com OR burcsi@obe.com OR aisha@modern.ca OR 
      leanne@garibaldiglass.com OR blair_grace@gentek.ca)
has:attachment
newer_than:7d
```

- Supplier email addresses sourced from Firestore `suppliers` collection
- Only process emails with PDF attachments (filters out admin/credit/warranty noise)
- Track `last_checked_message_id` to avoid re-processing

### Matching Logic

1. **Regex scan** subject + body snippet for `/(RFQ|PO)-\d{4}-\d{4}/i`
   - If found → direct match to document by `doc_number`
   - Works for: Modern (includes doc number in quote subjects), Hartung (auto-replies), Garibaldi (reply threads), Gentek (reply threads)

2. **Project name match** — if no doc number found:
   - Extract subject line text
   - Compare against `project_name` and `job_address` fields on all "Sent" documents for that supplier
   - Fuzzy match (case-insensitive, substring)
   - Works for: OBE (references job names), Gentek (sometimes uses project addresses)

3. **Fallback** — supplier domain match only:
   - If a PDF email comes from a known supplier and there's exactly 1 open "Sent" doc to that supplier → auto-match
   - If multiple open docs → flag as "Possible response" for manual review

### Supplier Email Patterns (from real inbox analysis)

| Supplier | Reply Style | Doc Number in Subject? | Always PDF? |
|----------|------------|----------------------|-------------|
| Hartung Glass | Auto-reply + manual | ✅ Usually | ✅ |
| OBE (BURCSI) | Automated quote system | ✅ Sometimes (in job field) | ✅ |
| Modern | New email with quote ref | ✅ YES ("Quote XX FOR RFQ-2026-XXXX") | ✅ |
| Garibaldi Glass | Reply thread | ✅ YES | ✅ |
| Gentek | Mix of reply + new email | ⚠️ Sometimes | ✅ |

---

## Data Model Changes

### `documents` collection — new fields

```javascript
{
  // Existing fields...
  response_status: "awaiting" | "received" | null,  // null for drafts
  response_date: Timestamp | null,                   // when response detected
  response_email_from: String | null,                 // "aisha@modern.ca"
  response_email_subject: String | null,              // snippet for context
}
```

### `suppliers` collection — new fields

```javascript
{
  // Existing fields...
  contact_emails: ["aisha@modern.ca", "meagan@modern.ca"],  // for Gmail matching
}
```

### `system` collection — new document: `email_sync`

```javascript
{
  last_checked_at: Timestamp,
  last_message_id: String,       // Gmail message ID to avoid re-processing
  last_run_status: "success" | "error",
  last_error: String | null,
  documents_updated: Number,     // count from last run
}
```

---

## UI Changes

### History Page — Document Row Badges

| Status | Badge | Color |
|--------|-------|-------|
| Document is Draft | (no response badge) | — |
| Document sent, no response yet | 🟠 AWAITING | Orange |
| Response detected or manually marked | 🟢 RECEIVED | Green |

- Badge appears in the STATUS column next to the existing status dropdown
- Clicking the badge toggles between AWAITING ↔ RECEIVED (manual override)

### Dashboard — New Stat Card

```
📬 Supplier Responses
   3 of 5 RFQs responded
   2 awaiting (oldest: 4 days ago)
```

### History Filters — New Filter

- Add "Response" dropdown: All / Awaiting / Received
- Allows filtering for "show me everything I'm still waiting on"

---

## Backend — New Components

### 1. Cloud Function: `checkSupplierResponses`

- **Trigger:** Cloud Scheduler, every 15 minutes
- **Auth:** Gmail API via service account with domain-wide delegation (existing pattern from Drive integration)
- **Scope:** `https://www.googleapis.com/auth/gmail.readonly`
- **Logic:**
  1. Load supplier contact emails from Firestore
  2. Load all documents with `status: "Sent"` and `response_status: "awaiting"`
  3. Query Gmail for emails from supplier domains with PDF attachments
  4. For each email, run matching logic (doc number → project name → fallback)
  5. Update matched documents in Firestore
  6. Update `system/email_sync` with run status

### 2. API Endpoint: `PATCH /documents/:id/response`

- **Purpose:** Manual toggle for response status
- **Body:** `{ response_status: "received" | "awaiting" }`
- **Sets:** `response_date` on first "received", clears on "awaiting"

### 3. API Endpoint: `GET /documents/response-summary`

- **Purpose:** Dashboard stat card data
- **Returns:** `{ total_sent, total_awaiting, total_received, oldest_awaiting_days }`

---

## Gmail API Authentication

Use the same JWT/service account pattern already in place for Google Drive:

```javascript
const { google } = require('@googleapis/gmail');  // lightweight package
const jwt = new google.auth.JWT(
  serviceAccount.client_email,
  null,
  serviceAccount.private_key,
  ['https://www.googleapis.com/auth/gmail.readonly'],
  'shane@westernwindows.ca'  // impersonate
);
```

**Note:** The service account needs the `gmail.readonly` scope added in Google Workspace Admin → Security → API Controls → Domain-wide Delegation.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Gmail API OAuth/scope issues (past pain) | Use existing SA + JWT pattern from Drive integration |
| False positive matches | PDF filter + doc number regex eliminates most noise; manual override as escape hatch |
| Supplier uses new email address | `contact_emails` array is editable; add new addresses as discovered |
| Rate limits (Gmail API) | 15-min interval is well within quota; batch queries by supplier |
| Scheduled function cold starts | Use lightweight `@googleapis/gmail` package (not full googleapis) |

---

## Implementation Order

1. **Data model** — Add fields to documents + suppliers collections
2. **Manual toggle** — PATCH endpoint + UI badge (shippable standalone)
3. **Gmail integration** — Scheduled function + matching logic
4. **Dashboard** — Response summary stat card
5. **History filter** — Response status filter dropdown

Steps 1-2 are independently useful — ship manual toggle first, then layer on auto-detection.
