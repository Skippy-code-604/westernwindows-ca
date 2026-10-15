# Google Drive Auto-Export Design

## Goal
When a document (RFQ/PO) is sent to a supplier, automatically upload the PDF to Google Drive in a structured folder hierarchy for filing and searchability.

## Folder Structure
```
Western Windows/
└── {YYYY}/
    └── {Month}/
        └── {Project Name}/
            ├── RFQ-2026-0001 — Gentek.pdf
            ├── RFQ-2026-0002 — OBE.pdf
            └── PO-2026-0003 — Gentek.pdf
```

- If project_name is empty, use doc_number as the folder name
- Months are full names (January, February, etc.)
- Folder creation is idempotent (reuse existing folders)

## Technical Approach
- **Auth**: Firebase service account (already available in Cloud Functions)
- **API**: Google Drive API v3 via `googleapis` npm package
- **Loading**: Lazy-loaded to avoid cold start timeouts
- **Root folder ID**: Stored as Cloud Secret `DRIVE_ROOT_FOLDER_ID`
- **Caching**: In-memory folder ID cache to avoid repeated Drive queries
- **Integration point**: POST /api/email/send/:id — after PDF generation, before/parallel to email send
- **Non-blocking**: Drive upload failures log a warning but don't fail the send

## Files Changed
- `functions/drive.js` — NEW: Google Drive service module
- `functions/routes/email.js` — Hook Drive upload into send flow
- `functions/firestore.js` — Add updateDriveUrl function
- `functions/index.js` — Add DRIVE_ROOT_FOLDER_ID to secrets list
- `functions/package.json` — Add googleapis dependency

## One-Time Setup (Manual)
1. Enable Google Drive API on western-windows-ca GCP project
2. Create "Western Windows" root folder in Google Drive
3. Share folder with Firebase service account email
4. Store root folder ID as Cloud Secret: `DRIVE_ROOT_FOLDER_ID`
