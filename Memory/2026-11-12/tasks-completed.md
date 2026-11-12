# 2026-11-12

## Tester support message, and the support and help desk plan (rcfworks)

- **What happened.** On 2026-11-10 a staging tester sent two identical messages through the staging Contact page: "Need full access to complete test run".
  - They reached infinex1's Gmail because support@sponsorx.net is only a Cloudflare forward there (set up 2026-10-07; it has no mailbox or password and can't send).
  - Rodney forwarded the "New sponsor: Midwest Running Co needs your review" email asking whether it was real, and for his login.
- **What staging showed.** Read-only queries; production reads were blocked in this session.
  - **Athlete sign-up** (softball, Plata High, MD): held. The ID "doesn't read like a government ID", and the date of birth on the account isn't on it.
  - **Sponsor brief** "Midwest Running Co" (SponsorX Test Drive): held. The proof of business PDF has readable text but doesn't name the business. It also made a Zoho CRM lead (7554807000013348002).
  - "Midwest Running Co" isn't a real business that we could find; it's made up for the test.
- **Replies drafted** (plain text, sent by the user from Gmail):
  - **To the tester:** both sign-ups approved so they can finish (the user approves them on staging: /admin/new-signups/athletes/cmwaxn32j00jz0cqignvgxyup and /admin/sponsor-requests/cmwaybrju00kl0cqisybjkn43).
  - **To Rodney:** it's a test. His admin logins (rcarr@icarrefound.org) exist on both sites since 2026-10-29. Use "Forgot password?" if the temporary-password email is lost.
- **Plan agreed with the user: Polish group G (items 41–43), six rows Ready on the Polish sheet.**
  - **POL-BE-41 / POL-FE-41, Support inbox:**
    - statuses;
    - replies written in SponsorX and sent from noreply@;
    - the support@ email shrinks to a notice;
    - the sender's records and their problems shown beside each message.
  - **POL-BE-42 / POL-FE-42, "What's wrong" tags** on held sign-ups, sponsor requests and organisations, in lists and pages.
  - **POL-BE-43 / POL-FE-43, help desk form:** pick a topic, tick cases, Submit; "Other" opens the message box.
  - IDs follow polish.md's rule (number = item number), so the backend rows are 41–43, not the 37–39 first mentioned in chat.
  - **Decided (later the same day):** all six rows are rcfworks', front end included; people can tick more than one case; replies go by email only (no conversation page).
- **New doc:** `documentation/SponsorX-Helpdesk-Cases.md`.
  - 380 cases in 8 topics: Account 90, Payments 79, Guardians 63, Campaigns 58, Shop 49, Rewards 23, NEXT 17, Other 1.
  - Each case is matched to the code that causes it (main_development `db34ceb7`).
  - 69 cases have no admin page to fix them. They're listed under "Gaps" and are not part of 41–43.
- **Gaps worth raising separately (not yet on the board):**
  - campaign earnings can't be moved from any page (admin/finance is view only; VOIDED can't be shown);
  - no page to give a login or change an email;
  - closed users are told "isn't set up";
  - replacing a guardian is API-only;
  - no fan lookup;
  - nothing starts a campaign's final report.
- **Tracker:** Polish rows 62–67 added (Order 58–63, stage 7 "G · Support and help desk"). Autofilter, the Status list and the colour ranges now reach row 67, and the header says 63 tasks across 43 flaws.
