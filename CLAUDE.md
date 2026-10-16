# CLAUDE.md — Western Windows Landing Page

Next.js + Firebase app for **Western Windows** (windows/glazing contractor). We are adding a gated **CRM** at `/admin/crm`. WW's work is **not client emails** — it's **work orders from Impak Solutions for School District 44 (SD44)**.

**Read these for full context:** `CRM_PROJECT_HANDOFF.md` (business, routing, schema v1.2, WW lifecycle) and `CRM_BUILD_PLAN.md` (execution spec). This file is the quick map.

## Where the real code lives
- **Live app = `app/`** (i.e. `app/src/…`, Next.js 16.1.3, App Router). From `app/`: `npm run dev`, `npm run build`.
- **IGNORE** the repo-root static site (`index.html`, `script.js`, `styles.css`) and **`admin-console-template/`** — both are dead scaffolding. Do not edit them.
- Firebase project: **`western-windows-ca`**.
- **Deploy today = static export → `public/`** (via `build.ps1`, served with `/admin/**` → `admin.html`). **Planned: migrate to App Hosting** (Build Plan Phase 5) to match NSCCR. `vercel.json` is a leftover, ignore/remove. Until migrated, backend logic must live in `functions/`, NOT in page server code.

## Firebase
- `app/src/lib/firebase.ts` initializes and exports `db`, `auth`, `storage` (all ready — Storage included).
- Config via `NEXT_PUBLIC_FIREBASE_*` env vars.
- Rules: `firestore.rules` + `storage.rules` (wired in `firebase.json`). Deploy with `firebase deploy --only firestore:rules,storage`.

## Auth (already enforced — reuse, don't rebuild)
- `app/src/lib/auth-context.tsx`: Google popup login, allowlist `ADMIN_EMAILS = ['shane@nsccr.ca']`, with `settings/adminWhitelist` Firestore fallback.
- `app/src/app/admin/layout.tsx` gates every `/admin/*` route. Anything under `/admin` inherits this gate for free.
- Admin = shane@nsccr.ca only, in the app allowlist AND `firestore.rules`/`storage.rules` `isAdmin()` (keep all three in sync). Chris (chris@nsccr.ca / chris@westernwindows.ca) left Western Windows; removed everywhere 2026-10-16.

## The pattern to copy for new features
`app/src/lib/services/<thing>-service.ts` (Firestore CRUD) → `app/src/app/admin/<thing>/page.tsx` (`'use client'` page) → add a nav item in `app/src/app/admin/layout.tsx`.
- Simple CRUD model: `services-service.ts`. With Storage upload + cleanup: `contractors-service.ts`.
- Convention: `interface` with `id?`, `createdAt?`; `const COLLECTION='...'`; `get/add/update/delete` async fns.
- UI: Radix + Tailwind + `lucide-react`, components in `app/src/components/ui`. Toasts via `sonner` / `useToast()`.
- Existing backend: `functions/` already has `api` (project list/detail, supplier price history) and a `documents` collection with indexes — build the billing lane on this.

## Firestore collections
- **Public-read (website):** `gallery`, `contractors`, `partners`, `services`, `reviews`.
- **CRM (admin read+write only):** `tickets`, `projects`, `documents` (billing lane — already in use). Plus `settings`, `error_logs`.
- CRM files go in Storage under `tickets/<id>/…` (admin-only).

## CRM specifics (WW = Impak / SD44)
- Source: **Impak** (`DONOTREPLY@impaksolutions.com`), `WO # <num>` — parse **plaintext** labeled fields (WO#, due, status, property/room, requestor, technicians). Attachments are **URLs** on `impaksolutionsii.com`, not email attachments — fetch from the link.
- **Approval (front gate):** WOs arrive already approved → cleared to start, UNLESS large project or **Glenn** specifies. Watch for that trigger → `awaiting-wo-approval`.
- **Close-out (back gate):** no "mark complete" — **the invoice IS completion.** Submit invoice to `accountspayable@sd44.ca`, **CC Glenn**, **WO# on invoice** → Glenn approves → paid.
- **Glenn = approver** at BOTH ends (model as `approver`, not a CC). Danger flags: `unbilled-job`, `awaiting-invoice-approval`, `awaiting-wo-approval`, `missing-wo-on-invoice`.

## Guardrails (NON-NEGOTIABLE)
1. Work on `feat/crm-intake`. **Never commit to `master`.** Restore point: `master` @ `0124b21`.
2. **Raw email content never enters this repo** — only structured ticket data + file URLs.
3. **Send is always Shane's tap** — the app may pre-build the SD44 invoice email (to AP, CC Glenn, WO#), but never auto-sends.
4. **Never auto-route across businesses.** Unsure → `tickets` with `flags:['unrouted']` for review. A misroute is a cross-business data leak.
5. Review every auth-touching diff before merge. Branch before edits.

## Current state
On `feat/crm-intake`. Foundations done: Firestore/Storage rules authored (CRM private). Next: Phase 2 MVP — `/admin/crm` route + layout, `tickets-service.ts`, list + detail + one-click internal actions. See `CRM_BUILD_PLAN.md` §2–§6, §10.
