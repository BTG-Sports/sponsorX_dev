# 2026-10-28 — tasks completed

### Six tasks raised (rcfworks), on `docs/P8-FE-12-campaign-cancel-change`

Each is defined in the Phase 1 doc (Stage 8) and is a row in the tracker.

- **Document checks.** Found today: a government ID arrived as an almost black, blurred photo. The upload checked only the type, the size and that the file arrived. The user: "do 1 and 2", then "do A and B", across all documents.
  - **`P8-BE-09` (In progress, rcfworks).** Every document upload is opened at its confirm step. One that is renamed, damaged, password-locked, too small, too dark, blank, washed out or blurred is refused with the reason, deleted and audited.
  - **`P8-BE-10` (In progress, rcfworks).** BTG can send any document it reviews back with a reason. The person is emailed and uploads a new one.
  - **`P8-BE-11` (In progress, rcfworks).** The server reads each document with OCR on our own server, sends nothing out and keeps none of the text. It compares the name, the kind, the expiry and the athlete's date of birth. A flagged or unread document holds the automatic approval it belongs to for BTG, with the findings as reasons.
  - **`P8-FE-11` (Blocked, for HeckerCreatives).** Refusal reasons on the upload screens; each document's result and a Send back button on BTG's review screens.
- **Campaign cancel and change**, from Rodney's questions ("How do you cancel a campaign?", "How do you update a campaign?").
  - **Today:** the API can cancel (BTG only), but there's no button, cancelling doesn't settle the athlete orders under the campaign, and nothing can change a campaign once it is set up. "Edit campaign" on BTG's campaign page saves nothing.
  - **The user:** add the buttons; automate cancel and change as far as possible, emailing BTG admins when it won't go through; and show a modal of what will be affected before confirming. Sponsors' admins and BTG both get the buttons.
  - **`P8-BE-12` (Ready, rcfworks).** Impact reads, automatic cancel and change, held requests for BTG.
  - **`P8-FE-12` (Ready, HeckerCreatives).** The two buttons, the impact modal, and BTG's Campaign requests list, built against `P8-BE-12`'s contract in the Phase 1 doc.

### `P8-BE-09`, `P8-BE-10` and `P8-BE-11` Done (rcfworks), on `feature/P8-BE-09-document-checks`

- **`P8-BE-09`.** Every document confirm step opens the file through `storage.checkPrivateUpload` `document: true` and `lib/document-inspect.ts`. A file is refused in plain words when it is renamed, damaged, password-locked, too small, too dark, washed out, blank or blurred; it is then deleted and audited.
  - **Limits:** calibrated on a drawn ID card and on the real near-black upload (mean brightness 12, edge score 6, both refused).
  - **New libraries, pinned:** `pdfjs-dist` 6.4.299, `@napi-rs/canvas` 1.0.11, `tesseract.js` 7.0.0, `@tesseract.js-data/eng` 1.0.0.
- **`P8-BE-11`.**
  - **Reading:** a PDF's own words, or OCR on our own server. The English data ships in node_modules, nothing is sent out, and none of the text is stored.
  - **Comparing:** the name, the kind of document, the expiry and the athlete's date of birth.
  - **Holding:** a flagged or unread document holds the sign-up, organisation, sponsor request, handoff or legal name for BTG, with reasons. BTG answers a held legal name with `POST /profile-changes/{id}/decision`.
  - **Where results sit:** on each document's row (migration `20261028120000_document_checks`, nullable columns only), and in BTG's views as `check`.
- **`P8-BE-10`.** BTG sends a document back with a reason in five flows: sign-ups, organisations, sponsor requests, handoffs and legal names. The document stops counting, its file is deleted, the person is emailed the reason and their upload link (`document.sentBack`), and the flow goes back to waiting.
  - **Bug found and fixed in testing (by a test-writing helper):** a guardian's sent-back document left the held minor's old reasons in place. It now clears them.
- **`P8-FE-11`** is now Ready for HeckerCreatives. Every route and field is in the Phase 1 doc.
- **Checked locally on portable Postgres 17:**
  - build, lint, security scripts, the secret scan and the dependency audit all pass;
  - **3,592 / 3,592** backend tests pass, including the new `document-checks` (27) and `document-flows` (24) tests and the updated `private-upload-pins` and `tenant-isolation` tests.
- **The user's question, "send back the photo via email?":** no. The email carries the reason and the upload link only. An ID is never emailed, and the sent-back file is deleted.
