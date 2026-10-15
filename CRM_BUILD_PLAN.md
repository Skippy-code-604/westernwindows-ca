# CRM Build Plan — `/admin/crm`

**Companion to:** `CRM_PROJECT_HANDOFF.md` (read that first for business context, routing, schema v1.2, guardrails).
**Scope:** add a gated CRM to BOTH existing admin apps. This file is the execution spec for the build branch (`feat/crm-intake`). Identical copy lives in each repo root.
**Decision locked:** CRM is a gated route at **`/admin/crm`** inside each existing admin app — not a separate app. Optional later: surface NSCCR's at `command.nsccr.ca` via a hosting rewrite (the route is built the same way regardless).

---

## ▶️ Kickoff prompt (paste into Claude Code, in this repo)

```
You're in the Western Windows Landing Page repo (Next.js 16, live app in app/src/,
Firebase project western-windows-ca). NOTE: ignore the repo-root static site and
admin-console-template/ — both are dead. Deploy is still static export → public/
(migrating to App Hosting later), so backend logic goes in functions/, not page
server code. Read CLAUDE.md, CRM_PROJECT_HANDOFF.md, and CRM_BUILD_PLAN.md first.

Confirm we're on branch feat/crm-intake — NEVER commit to master.

Build Phase 2 (see Build Plan §2–§6, §10): the gated /admin/crm route with its
own CRM layout (Tickets · Billing · Unrouted), app/src/lib/services/tickets-service.ts
following the existing services-service.ts (CRUD) and contractors-service.ts
(Storage upload + cleanup) patterns, the tickets list + [ticketId] detail pages
with one-click internal actions (status/flags/owner = Firestore writes), and
register one CRM nav item in app/src/app/admin/layout.tsx. Build the billing lane
on the existing `documents` collection + functions/ api.

Reuse the existing auth gate and the Radix + Tailwind + lucide-react UI in
app/src/components/ui (toasts via sonner) — do NOT rebuild auth. Show me a plan
and the diffs before applying. Commit incrementally on feat/crm-intake.

Do NOT build Gmail/outbound or the email ingest yet — those are later phases.
```

---

## 0. Foundations already in place (done on this branch)

- **Firestore rules** authored/updated in both repos: website collections stay public-read; CRM collections (`tickets`, `projects`, `documents`) are **admin read + write only**. (`firestore.rules`, wired into `firebase.json`.)
- **Storage rules** tightened in both repos: public read only for `gallery/ services/ partners/ contractors/`; everything else (incl. CRM files) admin-only. The old public-read catch-all is gone. (`storage.rules`.)
- **NSCCR `.gitignore`** fixed to exclude `functions/node_modules`.
- Both repos committed to `feat/crm-intake` with `SentToVS`/`master` intact as fallback.

**Before tickets hold real data:** deploy the rules — `firebase deploy --only firestore:rules,storage` in each repo — and confirm the public sites still load all images.

---

## 1. The two apps are NOT identical — build targets

| | NSCCR | Western Windows |
|---|---|---|
| Live app tree | `src/app/…` | `app/src/app/…` |
| Next.js | 15.5.9 | 16.1.3 |
| Firebase project | `nsccr-web-site` | `western-windows-ca` |
| Deploy | App Hosting (SSR) | static export → **migrating to App Hosting** |
| Admin allowlist (`auth-context.tsx`) | `['shane@nsccr.ca']` | `['shane@nsccr.ca','chris@nsccr.ca']` |
| Existing backend | `functions/` (`api`) | `functions/` (`api`: project list/detail, supplier price history) + `documents` collection & indexes |
| CRM business | White Spot / OneDesk + coordinators | Impak / SD44 work orders |

**Reuse, don't reinvent:** both apps already follow one pattern —
`lib/services/<thing>-service.ts` (Firestore CRUD) → `app/admin/<thing>/page.tsx` (client page) → registered in `app/admin/layout.tsx` nav. Auth is enforced once by `app/admin/layout.tsx` (Google login + email allowlist + `settings/adminWhitelist` fallback). `lib/firebase.ts` already exports `db`, `auth`, `storage`. **A new CRM feature inherits the auth gate for free.**

---

## 2. Routing & layout (the "standalone feel" without a separate app)

Create a nested route group so `/admin/crm` gets its own full-width shell, distinct from the marketing-admin sidebar, while still under the `/admin` auth gate.

```
src/app/admin/crm/                 (NSCCR)   ·   app/src/app/admin/crm/   (WW)
  layout.tsx        # CRM shell: own top nav (Tickets · Billing · Unrouted), full width
  page.tsx          # Tickets list (default view)
  [ticketId]/page.tsx   # Ticket detail
  billing/page.tsx  # Billing lane (invoices/POs/statements — NOT tickets)
  unrouted/page.tsx # Privacy-wall review bucket
```

- Add ONE link from the existing admin dashboard / sidebar: `{ href: '/admin/crm', icon: ClipboardList, label: 'CRM' }` in `app/admin/layout.tsx`.
- `crm/layout.tsx` still renders inside the parent admin layout, so `useAuth()` / the redirect-if-not-admin guard already protect it. No new auth code.

---

## 3. Data model (condensed from handoff v1.2 — full schema there)

Collections per project (each repo = its own Firebase project = the privacy wall):

- **`tickets`** — shared core + per-business extension. Core fields: `ticketId, business, source, title, category, status, rawStatus, owner, nextAction, dueDate, flags[], files[], invoiceRef, projectId, gmailThreadIds[], opened, lastActivity`.
  - NSCCR extension: `clientTicketId, onedeskUrl, client, storeNumber, location, coordinator, siteContact, po, clientChases`.
  - WW extension: `workOrderNumber, impakPortal, property, propertyCode, room, address, requestor{}, approver{}, technicians[], invoiceTo, invoiceCc[], woRequiredOnInvoice, approvalGated`.
- **`projects`** — optional grouping (mainly NSCCR scope threads): `projectId, business, storeNumber, location, title, po, status, gmailThreadIds[]`.
- **`documents`** — billing lane (invoices/POs/statements). WW already uses this collection + has indexes; NSCCR adds it.

**Status flow (WW):** `new → (awaiting-wo-approval, exception) → scheduled → in-progress → invoiced → (awaiting-invoice-approval) → closed`.
**Flags:** `overdue, unbilled-job, awaiting-invoice-approval, awaiting-wo-approval, missing-po, missing-wo-on-invoice, verbal-quote-not-formalized, client-chasing, unrouted`.

---

## 4. Service layer — `lib/services/tickets-service.ts`

Copy the shape of the existing `services-service.ts` (CRUD) and `contractors-service.ts` (the Storage upload + delete-cleanup pattern). Add ticket-specific reads:

```ts
const COLLECTION = 'tickets';
export interface Ticket { /* core + extension fields, id?, createdAt?, updatedAt? */ }

export async function getTickets(opts?): Promise<Ticket[]>      // ordered by dueDate / lastActivity
export async function getTicket(id): Promise<Ticket|null>
export async function addTicket(t): Promise<string>
export async function updateTicket(id, patch): Promise<void>    // status, flags, owner, etc.
export async function uploadTicketFile(ticketId, file, tag): Promise<FileRef>  // Storage: tickets/<id>/...
```

Also: `projects-service.ts`, `documents-service.ts` (billing) following the same template.

**Internal actions = Firestore writes** (mark approved/invoiced/paid, flag file, set owner) — one-click, zero friction, no email.

---

## 5. The router & the unrouted bucket (privacy wall)

Per handoff, the sweep (in chat) triages and emits structured tickets tagged `business`. The repo side handles **ingest + safety**:

- An **ingest path** (recommended: a callable/HTTP **Cloud Function** in `functions/`, admin-auth required) that accepts a structured ticket and writes it to THIS project's `tickets`. Keeps raw email out of the repo (guardrail #2) — only structured JSON + file URLs cross over.
- **Routing rule on write:** confirm the ticket belongs to this business (alias → known contacts/systems → content tiebreak, per handoff priority order). If not confidently this business → write to **`tickets` with `flags:['unrouted']`** and surface in `/admin/crm/unrouted` for manual placement. **Never auto-place across businesses.**
- Cross-business misroute = data leak, so default to unrouted whenever unsure.

Phase 1 can ingest manually (paste/import structured tickets); automate the Function ingest in Phase 3.

---

## 6. Ticket UI

- **List (`crm/page.tsx`):** table/cards with filters by `status`, `category`, `store#` (NSCCR) / `WO#` (WW), `owner`, and quick flag chips (overdue, unbilled-job, awaiting-approval…). Default sort: what's in our court + due date. Link out to Gmail thread and to OneDesk/Impak.
- **Detail (`crm/[ticketId]/page.tsx`):** full ticket, file list (tagged po/invoice/quote/wo/photo), status timeline, one-click internal actions, and the outbound box (§7).
- Use the existing shadcn/Radix + Tailwind + lucide components already in `components/ui` — match the look of the current admin pages.

---

## 7. Outbound / reply — SEND stays Shane's tap (guardrail #3)

- Outbound via **Gmail API**, threaded, **from the correct send-as alias** (WW → westernwindows.ca; NSCCR → nsccr.ca).
- **NSCCR/OneDesk:** reply box posts back into the OneDesk-driven thread.
- **WW close-out:** not a reply — a **pre-built invoice email** to `accountspayable@sd44.ca`, **CC Glenn**, **WO# on the invoice**. The app pre-fills it from the ticket.
- The app **pre-drafts** (addressed, filled, in the box). **Shane hits send.** No auto-send.
- Requires: Gmail send scope + send-as aliases configured (Shane's task).

---

## 8. Backend (Cloud Functions, both repos already have `functions/`)

Backend-only work lives in `functions/`, never in the static/SSR page layer (critical for WW until App Hosting migration lands):

- File fetch jobs: NSCCR pulls Gmail MIME attachments (drop `image001.png` logo noise); WW fetches Impak file **URLs** (`impaksolutionsii.com/...`) → store bytes in Firebase Storage, write `files[]` refs.
- Ticket ingest endpoint (§5).
- Outbound send proxy (Gmail API) — triggered by Shane's tap.
- Flag computation (overdue, unbilled-job, missing-po/-wo).

---

## 9. Firestore indexes to add (when queries are finalized)

Likely composite indexes on `tickets`: `(status ASC, dueDate ASC)`, `(business ASC, status ASC, lastActivity DESC)`, `(flags ARRAY, dueDate ASC)`. Add to `firestore.indexes.json` and wire `firestore.indexes` in `firebase.json` (WW already has an indexes file; NSCCR will need one). Deploy with `--only firestore:indexes`.

---

## 10. Build phases

1. **Foundations** ✅ rules + branch (done). Deploy rules, verify public sites.
2. **Read/act CRM (MVP):** route + layout, `tickets-service`, list + detail, one-click internal actions, manual/imported ticket entry. Per repo.
3. **Ingest + files:** Cloud Function ingest with routing→unrouted; file fetch (Gmail MIME / Impak URL) → Storage.
4. **Outbound:** Gmail send-as + pre-drafted replies / WW invoice email (Shane-triggered).
5. **WW deploy migration:** move WW from static export to App Hosting (matches NSCCR). Separate, testable step.
6. **Later branch:** QuickBooks integration (`feat/quickbooks`) — link ticket ↔ invoice #.

---

## 11. Guardrails (from handoff — enforce in build)

1. Work on `feat/crm-intake`, never `main`/`master`/`SentToVS`.
2. Raw email content never enters the repo — only structured data + file URLs.
3. Send is always Shane's tap.
4. Never auto-route across businesses — unsure → `unrouted`.
5. Review every auth-touching diff before merge.

---

## 12. Open items (Shane's calls — non-blocking for MVP)

- Confirm invoicing runs through QuickBooks (Phase 6 link ticket→invoice #).
- Confirm Glenn's full name vs the "Glenn Leonard" technician on the Argyle WO (model Glenn as `approver`, distinct person likely).
- WW: confirm `chris@nsccr.ca` should be a full read+write admin (added to rules to match the app allowlist — revert if he should be read-only).
- Decide whether `command.nsccr.ca` should front the NSCCR CRM (hosting rewrite; route unchanged).

---

## 13. Verification checklist (per repo, before merge)

- [ ] Rules deployed; public site loads all images; admin can read/write CRM collections; signed-out user cannot read `tickets`.
- [ ] `/admin/crm` redirects to login when not authed; loads for allowlisted admin.
- [ ] Create → list → detail → status change round-trips through Firestore.
- [ ] CRM file upload lands under `tickets/<id>/…` and is NOT publicly readable.
- [ ] No raw email content stored in the repo.
- [ ] Outbound box pre-fills but does not send without Shane's action.
- [ ] `git status` clean; only intended files committed.
