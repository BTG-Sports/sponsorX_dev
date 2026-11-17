# Deal Chat — the agreement forms and question cards (v1, approved)

**Task:** `2S4-BE-14` · **Feature:** [SponsorX-Deal-Chat-Feature.md](../SponsorX-Deal-Chat-Feature.md) §5
**Status:** drafted by rcfworks and approved by the programme owner, 2026-11-17. Issued as `backend/agreements/DEAL.v1.txt`.

The three forms are issued as one file, `backend/agreements/DEAL.v1.txt`: the
shared wording once, and each form's own section (D7) marked so a package can
carry several. Adding the file is what issued it (`current-agreement.ts`).
From now on the wording only changes as a v2 file, which everyone signs again.

Like the approved v2 agreements, these leave out governing law, venue and
disputes, which BTG hasn't chosen yet (CLAUDE.md, open decisions).

---

## How a filled-in form is put together

The text people sign is one document: the form's fixed wording below, with the
blanks `{{…}}` filled in from the order and the chat. SponsorX records a
fingerprint of that exact filled-in text with each signature, the same as the
other agreements.

| Blank | Filled from |
|---|---|
| `{{sponsor}}` | The sponsor's business name |
| `{{seller}}` | The athlete's name; for a minor, "*athlete*, represented by their parent or guardian *guardian*"; for a team, the team's name |
| `{{orderRef}}` | The order number |
| `{{items}}` | One line per item bought: what it is, how many, the dates |
| `{{answers}}` | One sentence per agreed question card (§4 below) |
| `{{specialTerms}}` | Every agreed offer exchange, word for word, with who wrote each message and when. "None" if there were none |
| `{{amount}}` | The final amount both typed, and the original amount if it changed |
| `{{date}}` | The date the form was posted |

---

## 1. The shared wording (all three forms)

```
SPONSORX DEAL AGREEMENT — {{FORM NAME}} — VERSION 1

Order {{orderRef}} · {{date}}

D1. Who this agreement is between

This agreement is between {{sponsor}} ("the Sponsor") and {{seller}} ("the
Seller"). BTG Sports Group LLC ("BTG") runs SponsorX, where it was made. BTG
is not a party to this agreement and does not enforce the terms the Sponsor
and the Seller agreed between themselves. The order itself — paying,
cancelling, delivery, problems and refunds — stays under the SponsorX
Marketplace Order Terms the Sponsor accepted when placing it. If anything here
conflicts with those terms, those terms apply.

D2. What is being delivered

{{items}}

D3. What you agreed in the chat

{{answers}}

D4. Special terms agreed between you

{{specialTerms}}

These are the exact messages both of you accepted in the chat. They bind the
Sponsor and the Seller only.

D5. The amount

{{amount}}

This is the amount the Sponsor pays for this order through SponsorX. Neither
side may ask for or accept payment for this deal outside SponsorX.

D6. What each side confirms

The Seller confirms that:
- every post or appearance made under this agreement will clearly show it is
  sponsored (for example #ad or "Paid partnership"), and will tag or name the
  Sponsor;
- they have checked that their school, league, team and local rules allow
  this deal. Those rules are the Seller's responsibility.

The Sponsor confirms that:
- if its product or service is alcohol, tobacco or vaping, cannabis,
  gambling, firearms or adult content, BTG has approved this deal, and it will
  not be promoted to anyone too young to buy it;
- it has authority to make this agreement for the business named above.

Where the Seller is under 18, their parent or guardian confirms that they
consent to this deal on the minor's behalf.

{{FORM SECTION — see §2}}

D8. Changing your mind

Until the order is paid, either side may call the deal off in the chat,
giving a reason. The order is then cancelled and nobody is charged. Once it is
paid, cancelling and refunds follow the SponsorX Marketplace Order Terms.

D9. Signing

Each side signs by pressing Sign in SponsorX. That has the same effect as a
handwritten signature. Where the Seller is under 18, their parent or guardian
signs for them. SponsorX records who signed, the time, and a fingerprint of
the exact text shown.
```

---

## 2. The section each form adds (D7)

### Form 1 — Content (social posts, videos)

```
D7. The content

The Seller makes and posts the content listed in D2 on the dates shown there.
The Seller owns what they make. The Sponsor may use it only as D3 and D4
allow, and only for the period agreed in D3; after that the Sponsor stops new
uses. A post stays up for at least 30 days unless D3 or D4 says otherwise.
Neither side may change the other's words or images without their agreement.
```

### Form 2 — In person (appearances, autograph sessions, camps or clinics)

```
D7. The appearance

The Seller attends on the date and at the place listed in D2, for the length
agreed in D3. Travel is covered as D3 says. If the Seller cannot attend
because of illness, injury or something outside their control, they tell the
Sponsor in the chat as soon as they can; it is then handled as a problem or a
cancellation under the SponsorX Marketplace Order Terms. Filming or
photographing the appearance is allowed only as D3 says.
```

### Form 3 — Placement (signage, tickets, other)

```
D7. The placement

The Seller places or provides what D2 lists, for the period shown there.
Artwork or materials are supplied as D3 says; anything the Sponsor supplies
must reach the Seller in time to be used, and the Seller is not responsible
for a delay caused by late materials. The Sponsor's materials stay the
Sponsor's.
```

A **package** gets one agreement: the shared wording once, then the D7
sections of each kind of item it contains, numbered D7a, D7b and so on.

---

## 3. The question cards

A card is agreed when both pick the same answer, or when both accept an offer
on it (feature spec §3.3–3.4). Each agreed card becomes one sentence in D3.

| Form | Card | Answers |
|---|---|---|
| All | Does the Sponsor approve the content or plan before it goes live? | Yes / No |
| All | Exclusivity: no competing brand in the same category during the deal? | Yes / No |
| Content | May the Sponsor reuse the content on its own channels? | Yes / No |
| Content | May the Sponsor use it in paid ads? | Yes / No |
| Content | How long may the Sponsor use it? | 30 days / 90 days / 1 year |
| Content | Which platforms? (tick all that apply) | Instagram / TikTok / X / YouTube |
| Content | One round of changes included? | Yes / No |
| In person | Does the Sponsor cover travel? | Yes / No |
| In person | May the Sponsor photograph or film it? | Yes / No |
| In person | How long? | 1 hour / 2 hours / Half day |
| Placement | Does the Sponsor supply the artwork or materials? | Yes / No |
| Placement | Placement period as listed? | Yes / No |

---

## 4. What each answer says in the agreement (D3)

| Card | Answer | Sentence in D3 |
|---|---|---|
| Approval first | Yes | The Sponsor reviews the content or plan before it goes live and answers within 2 working days; no answer counts as approval. |
| | No | The Seller does not need the Sponsor's approval before it goes live. |
| Exclusivity | Yes | During the deal dates the Seller will not promote a brand that competes with the Sponsor in its category. |
| | No | The Seller may work with other brands, including competitors, during the deal. |
| Reuse | Yes | The Sponsor may share and repost the content on its own channels. |
| | No | The Sponsor may share the Seller's original post but not repost or reuse the content. |
| Paid ads | Yes | The Sponsor may use the content in paid advertising. |
| | No | The Sponsor may not use the content in paid advertising. |
| How long | 30 days / 90 days / 1 year | The Sponsor may use the content for *30 days / 90 days / 1 year* from its first posting. |
| Platforms | *ticked* | The content is posted on *Instagram, TikTok…*. |
| Changes | Yes | One round of changes is included, asked for within 2 working days of seeing the content. |
| | No | No changes are included once the content is delivered. |
| Travel | Yes | The Sponsor covers the Seller's reasonable travel to and from the appearance. |
| | No | The Seller covers their own travel. |
| Filming | Yes | The Sponsor may photograph and film the appearance and use the footage as the content terms allow. |
| | No | The Sponsor may not photograph or film the appearance. |
| How long (in person) | 1 hour / 2 hours / Half day | The appearance lasts *1 hour / 2 hours / half a day*. |
| Materials | Yes | The Sponsor supplies the artwork or materials. |
| | No | The Seller produces the artwork or materials from the Sponsor's brand assets. |
| Period as listed | Yes | The placement runs for the period shown in D2. |
| | No | The placement period is as agreed in D4. |

If "Period as listed" is answered No, an offer exchange in D4 should say the
period. The form won't appear until every card is agreed, so that exchange
will be there.

---

## 5. The owner's answers (2026-11-17)

1. **2 working days** to approve content and to ask for changes: yes. The
   system also nudges by email: in the chat, whoever's turn it is gets a
   reminder after every 2 working days without a reply, until the agreement
   is signed (`2S4-BE-15`).
2. **Posts stay up at least 30 days** unless agreed otherwise: yes.
3. **Firearms and adult content** join the restricted list: yes. A deal in any
   of the six goes to a BTG person.
4. **No further cards**: the cards stay as listed in §3.
5. **The agreement is downloadable at any time by both sides**, and the
   download is on the sponsor's order card and the athlete's or team's item
   card (`2S4-BE-14` serves it; `2S4-FE-07` / `-08` show it).

## The questions as asked

1. **The two working-day windows** for approving content and asking for changes
   (§4): are these right, or do you want a different number?
2. **A post stays up for at least 30 days** unless agreed otherwise (Form 1,
   D7): keep, change, or drop?
3. **Restricted categories** (D6): I used SponsorX's four sensitive categories
   (alcohol, tobacco and vaping, cannabis, gambling), which already go to a BTG
   person and are never matched with minors. Should firearms and adult content
   be added? Today they are ordinary categories.
4. Is **anything missing** from the cards that sponsors and athletes commonly
   argue about (for example, the hashtag or wording to use, or how many posts
   per platform)?
