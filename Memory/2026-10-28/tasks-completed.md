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
