# SponsorX — upload audit (2026-11-19)

Audited by rcfworks at `main_development` 3a04d130. Read-only: nothing was changed to write this.

Two questions from the programme owner:
1. "SponsorX NEXT is supposed to be a magazine, but I did not find any pages for uploading photos or
   anything."
2. "Double check if an item can be uploaded, any file (photo, video, etc). There are no audits to
   check that."

Part 1 lists every upload SponsorX has today. Parts 2 and 3 cover what's missing. Part 4 covers what
nothing checks. Part 5 is the work, which the owner approved on 2026-11-19 and is now on the board.

## 1. Every upload today

Every upload goes straight from the browser to storage on a short signed link, never through our
servers.
- **Private uploads** (IDs, documents, drafts, artwork) are signed for one file type and one exact
  size. After the upload, the server reads back what arrived. A wrong file is refused, deleted and
  recorded.
- **Public uploads** (photos and logos people will see) are signed the same way, but aren't recorded.

| # | What | Who uploads | Screen | File types | Largest | Checked after upload | Real upload in tests |
|---|---|---|---|---|---|---|---|
| 1 | Athlete's draft or finished content | athlete (guardian for a minor) | athlete deliverable page | JPG, PNG, WebP, MP4, MOV | 2 GB | yes, plus automatic content checks | yes, plus a browser test |
| 2 | Seller's delivery proof | athlete, team, school | mark-delivered, sale wizard, problem answer | JPG, PNG, PDF | 10 MB | yes | yes |
| 3 | ID at sign-up, guardian set-up and coming of age | athlete, guardian | sign-up, guardian set-up | JPG, PNG, PDF | 10 MB | yes, and the document is opened and read | yes, plus a browser test |
| 4 | Onboarding documents | team, school (public wizard) | onboarding wizard | JPG, PNG, PDF | 20 MB (IDs 10 MB) | yes, opened and read | yes, plus a browser test |
| 5 | Organisation documents | property manager | property portal Documents | JPG, PNG, PDF | 20 MB | yes, opened and read | yes |
| 6 | Proof of business | a business asking to sponsor | sponsor request page | JPG, PNG, PDF | 20 MB | yes, opened and read | yes |
| 7 | Guardian hand-off documents | guardian | guardian hand-off page | JPG, PNG, PDF | 10 MB | yes, opened and read | yes |
| 8 | Support attachment | anyone | Contact page | JPG, PNG, PDF | 10 MB | yes | yes, plus a browser test |
| 9 | ID for a legal-name change | athlete | profile edit | JPG, PNG, PDF | 10 MB | yes, opened and read | yes |
| 10 | Dispute documents | either side of a paused deal | deal pause banner | JPG, PNG, WebP, PDF | 10 MB | yes, opened and read | **no** (storage faked) |
| 11 | Ad artwork for a sold magazine slot | sponsor | sponsor campaign page | JPG, PNG, PDF | 50 MB | yes, plus automatic artwork checks | yes |
| 12 | Student's magazine draft | student | NEXT Assignments | JPG, PNG, PDF | 20 MB | yes | **no** (storage faked) |
| 13 | In-game placement creative | sponsor | none (the game is parked) | JPG, PNG, WebP, MP4 | set per placement | yes, image pixels read | yes |
| 14 | Athlete profile photo | athlete | profile photo editor | JPG, PNG, WebP | 5 MB | yes (file must exist) | **no** |
| 15 | Team or school logo | property manager | branding form | JPG, PNG | 1 MB | **no**, only that it's their own folder | **no** |
| 16 | Sponsor company logo | sponsor admin | **none yet** (`POL-FE-102` open) | JPG, PNG | 1 MB | **no**, only that it's their own folder | **no** |

**Video:** only the athlete's content (#1) and the parked game's creative (#13) take video. Nothing in
SponsorX NEXT does, though the magazine has a "video" content kind.

## 2. SponsorX NEXT: the magazine can't carry pictures

**What works:**
- A student uploads a JPG, PNG or PDF with their text on an assignment (#12). The advisor opens it,
  then approves it or sends it back. This only works on the live site for a student who has an
  assignment. In demo mode the button is greyed out: "Uploading a draft isn't available yet."
- A sponsor uploads the ad for the slot they bought (#11).

**What's missing:**
1. **Readers never see a photo or an ad.** The public edition returns titles and article text only
   (`backend/src/routes/v1/editions.ts`, the public read).
   - Approved photos stay in private storage, and nothing makes a public copy.
   - Ads: the reader lists the sponsor's name but never shows the ad they paid for.
   - The free digital edition is the whole reader product in version 1 (spec principle 10).
2. **BTG can't upload anything.** The rights page's "add content" form takes a title, kind and source,
   but no file.
   - The API stores a file reference if one is sent, but there's no way to upload a file to get one.
   - It doesn't check the reference it's given, either.
   - So photos from BTG, athletes or outside photographers have no way in.
3. **No cover image and no press PDF.** The spec says the layout is done in InDesign or Canva, and the
   platform holds "approved artwork and the press PDF" (spec §9). Nothing stores, uploads or serves
   either one.
4. **No production board.** The spec's `/admin/next/production` page, where BTG sees all of an
   edition's content and what's ready to publish, was never built and has no task.
5. **No video in the magazine.** "Video" is a content kind, but nothing can upload one. A student's
   draft takes JPG, PNG and PDF only.
6. **A small bug.** An approved design piece becomes content of kind "DESIGN", which isn't one of the
   content kinds (`backend/src/domain/student-assignment.ts`, `approveAssignment`).

## 3. Elsewhere in SponsorX

1. **Logos are saved without checking the file arrived (#15, #16).** If the upload fails, the record
   still points at the file, and every page shows a broken image. The athlete photo (#14) already
   checks.
2. **The sponsor logo has no screen (#16).** Its backend is done; the page is `POL-FE-102`
   (HeckerCreatives).

## 4. What nothing checks

1. **Five uploads are never tested with a real file:** #10, #12, #14, #15 and #16.
   - The real-upload test (`backend/tests/private-upload-pins.test.ts`) puts a real file into a test
     storage for 11 flows.
   - The tests for these five replace storage with a fake.
   - The test's own completeness check only asks that every private upload is signed for one type
     and size. It doesn't ask that every upload is in the real-upload test, so a new upload can be
     added without one.
2. **Browser tests never really upload in CI.** Four flows have a browser test (#1, #3, #4, #8). CI's
   browser job has no storage, so the step where the browser sends the file is answered by the test
   itself.
3. **Nothing checks the live storage settings, and that has already broken uploads once.**
   - On 2026-11-16, the public storage on both staging and production had no rule letting the website
     upload to it. Every profile photo and logo upload failed, and nobody knew until someone tried.
   - The health check only asks whether the public storage exists. It doesn't check the private
     storage, and it never tries an upload from the website's address.

## 5. The work — on the board since 2026-11-19

**Backend (rcfworks):**

| ID | Task |
|---|---|
| `P9-BE-25` | **Uploads for edition content, in any format.** BTG, athletes and outside photographers can attach a file to a piece of edition content. The API accepts only files that came through its own upload, and checks each one. Fixes the "DESIGN" bug. |
| `P9-BE-26` | **Photos and ads in the reader.** When an edition is published, each photo and approved ad that has a digital right in force gets a public web copy. The public edition returns the image links. If the right ends, the web copy comes down. |
| `P9-BE-27` | **Cover image and press PDF for each edition.** Both are uploaded and checked. The cover shows in the reader and the edition list. The press PDF stays private, for BTG and the printer. |
| `P9-BE-28` | **Production board data.** One list per edition: every piece (student work in progress, approved content, ad artwork) with what each still needs before publishing. |
| `POL-BE-110` | **Logos checked on save.** A team, school or sponsor logo is saved only once its file has arrived, is the declared type, and fits the size limit. Otherwise the person is told to upload it again. |
| `POL-BE-111` | **Every upload tested with a real file.** Add #10, #12, #14, #15 and #16 to the real-upload test. Its completeness check then fails if any upload in the code, public or private, is missing from it. |
| `POL-BE-112` | **Real storage in CI's browser tests.** CI's browser job gets a real test storage, so the browser's upload step is actually tested. |
| `POL-BE-113` | **A live storage check.** Every day and after every deploy, on staging and production, check that each storage area accepts an upload from the website's address: ask permission as a browser would, put a small test file, read it back, delete it. If any step fails, the deploy check goes red and BTG hears about it. The health check also covers the private storage. |

**Frontend (HeckerCreatives):**

| ID | Task |
|---|---|
| `P9-FE-13` | A file picker on the rights page's "add content" form. |
| `P9-FE-14` | Photos, ads and the cover in the public reader. |
| `P9-FE-15` | Cover and press PDF upload on the editions page. |
| `P9-FE-16` | The production board page, `/admin/next/production`. |
| `POL-FE-102` | Already open: the sponsor Account page, with the logo upload. |

**Decided by the owner, 2026-11-19: the magazine takes any format.**
- Photos, video, PDFs and design files such as InDesign or Photoshop, from students and from BTG.
- `P9-BE-25` carries it.
- A file a browser shouldn't open in place is always downloaded, never shown.
- Only images and video a browser can show get a public web copy for the reader (`P9-BE-26`). Design
  files stay private, as source files for BTG.
