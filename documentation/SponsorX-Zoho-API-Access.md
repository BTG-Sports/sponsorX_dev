# Zoho API Access for SponsorX

| | |
|---|---|
| **Date** | 2026-09-14 |
| **Author** | rcfworks |
| **Task** | `P0-OPS-04` · Provision Zoho API credentials and sandbox — **Done** |
| **Audience** | Anyone who needs to know what exists and why. Written to be read without technical background. |
| **Not this document** | [`SponsorX-Zoho-Credentials-and-Sandbox.md`](./SponsorX-Zoho-Credentials-and-Sandbox.md) is the technical specification — scope list, environment contract, console runbooks, provisioning log. If you are doing the work, read that one. This is the summary of what was done and why it matters. |

---

## In plain terms

SponsorX now has permission to talk to Zoho, and a safe place to practise doing
it.

**1 · A key was created.** SponsorX can read and write records in Zoho by
itself, without anyone logging in. It was tested against the live system and
works — a real request came back successfully, and it confirmed that the
Athlete / Content Partner module built on 2026-09-11 is really there.

**2 · The key was deliberately limited.** It can create and update records, and
it **cannot delete anything at all**. That was a design choice rather than an
oversight: SponsorX's rules say records are suspended, never deleted, so a key
able to delete could only ever be used to break that rule. Twenty-four specific
permissions were granted, each justified against a documented need. Everything
else was refused, including all access to Zoho Books, which is deferred until an
open question about invoice mapping is settled.

**3 · A practice copy of Zoho was created** — `SponsorX-Dev`. It is a separate
copy of the system where the sync code can be built, tested and gotten wrong
without touching real sales data. The first version of any integration is wrong;
this is where it gets to be wrong safely.

**4 · It was filled with made-up data, not real data.** Zoho offered to copy
real contacts and real deals into it. That was refused. A test environment
exists to be broken and contractors have access to it — real people's details do
not belong there. Fabricated records exercise the code just as well.

---

## Why it matters

**This is the gate the entire Zoho integration sits behind.** Nothing that
connects SponsorX to Zoho can be built until these exist.

The point of that connection is straightforward. BTG's sales team already works
in Zoho. Without the integration, somebody re-types every sponsor, every deal
and every renewal by hand into a second system — and misses some. With it:

- a sponsor enquiry on the SponsorX site becomes a **lead** in Zoho
- a qualified brief becomes a **deal** carrying its budget
- a signed campaign moves that deal to won
- an approved athlete joins the **Content Partners** list
- a campaign nearing its end raises a **renewal** before anyone has to remember

Zoho keeps what it is good at — who we are selling to, and whether they have
paid. SponsorX keeps what was promised, who is delivering it, and whether it
worked. Neither system has to learn the other's job.

---

## ⚠️ This is for development

**The key created today is a development key.** It should not be what the live
system eventually runs on.

The reason is specific: a Zoho key is bound permanently to the account that
created it, and this one was created under a personal Google account
(`rcfworks@gmail.com`). If that person stops working on the project — or simply
loses their licence when the subscription renews — the connection stops with
them. There is no way to reassign a key after the fact.

**Rodney should create his own key for production**, from
`rcarr@icarrefound.org`. Three things make this easy:

- It takes about **fifteen minutes**.
- **He has to do it himself.** A key can only be created by the account signed
  in at the time, so it cannot be done on his behalf.
- **Nothing needs migrating.** Both keys work at the same time against the same
  Zoho and do not conflict. Development keeps its key; production gets its own.
  That separation is ordinary good practice, not a workaround.

He needs section 2.1a of the credentials document — the list of permissions to
paste in — and nothing else from it.

One related point: the secrets currently sit on a laptop rather than on a
server, simply because the server does not exist yet. They move there when it
does.

---

## Still outstanding

| | Why it matters | Whose call |
|---|---|---|
| **Zoho licence expires 2026-09-18** | Everything described here stops if it lapses. | Rodney — he is the account's primary contact |
| **Production key** | See above. Fifteen minutes, and only he can do it. | Rodney |
| **Where secrets live as a team** | Zoho One already includes **Zoho Vault** at no extra cost. Worth deciding rather than leaving each person to improvise. | Rodney |
| **Org timezone is set to Pacific** | No admin is on Pacific time. Every Zoho timestamp is currently three hours out. | Whoever holds admin |

The first three are one conversation, not three.
