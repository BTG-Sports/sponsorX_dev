# Documents Produced

Deliverables created for SponsorX so far (all editable Word docs, generated via python-docx):

| Document | Location | Purpose |
|----------|----------|---------|
| **Systems Architecture** | `Documentation/Architecture/BTG_SponsorX_Systems_Architecture.docx` | Complete technical architecture for landing page + Phase 1 + 3 dashboards. 20 sections, 38 tables. Confirmed stack locked in. For the technical team. |
| **Plain-English System Overview** | `Documentation/Overview/BTG_SponsorX_System_Overview_Plain_English.docx` | "What is this system?" guide for the whole (non-technical) team. 12 sections, 29 tables. Dispels the "is it a game?" confusion; Maria + Tony's Pizza story. |

## Systems Architecture — section list
1 Intro & Scope · 2 Goals & Principles · 3 System Context · 4 High-Level Architecture (Containers) · 5 Application Architecture · 6 Multi-Tenancy & RBAC · 7 Data Architecture · 8 Auth · 9 Core Workflows & State Machines · 10 Integration (Zoho) · 11 Analytics · 12 API · 13 Security & Compliance · 14 Marketing/Landing · 15 Infrastructure & Deployment · 16 Observability · 17 Non-Functional Requirements · 18 Phase-Forward Compatibility · 19 Decisions & Risks · 20 Appendices (stack, table catalog, economics, glossary).

## Overview — section list
Read This First · What Kind of App · Three Users · Real-Life Story · Core Loop · How the Money Works · How Athletes Are Priced & Chosen · QR Reward · What Each Screen Is · Where BTG Fits · Glossary · FAQ.

## Generator scripts (in session scratchpad, not in repo)
- `build_arch.py` — generates the architecture doc.
- `build_overview.py` — generates the overview doc.
- `extract.py` — extracts text from the `.docx` source docs for analysis.

Note: python-docx is installed in the environment (v1.2.0).
