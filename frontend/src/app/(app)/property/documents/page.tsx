import { BlockedNotice } from "@/components/ui";
import { EmptyState, SkeletonPage } from "@/components/states";
import { OrgDocumentsList } from "@/components/org-documents";
import { demoState } from "@/lib/demo";
import { DOCUMENTS_NOT_LIVE, SAMPLE_ORG_DOCUMENTS, needsYou } from "@/lib/org-documents-live";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Documents — 2S1-FE-04, the documents half (Claude Design
   OrgDocuments.dc.html, views list / replace). The property manager's
   organization documents after approval: what's on file, what has expired
   or is missing, earlier files, and replacing or adding one.

   SCAFFOLD on sample data. Reads and writes are 2S1-BE-07, not built:

     Reads  GET  /property/documents          (2S1-BE-07 — not built)
     Writes POST /property/documents/:kind    (2S1-BE-07 — not built)

   Checked 2026-10-01: the only document read today is BTG's reviewer route
   GET /onboarding/:id/documents (2S1-BE-02, backend/src/routes/v1/
   onboarding.ts), and the `propertyOnboarding` policy grants PROPERTY_MGR
   no read — so a manager cannot see their own files yet. Nothing here
   calls the API; every row is the labelled sample in
   lib/org-documents-live.ts. Replace and Upload open the dialog the
   endpoint will take, with its controls disabled and the reason shown.
   ?demo=loading|empty|error renders the branded states.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PropertyDocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("property");
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const data = demo === "empty" ? { ...SAMPLE_ORG_DOCUMENTS, documents: [] } : SAMPLE_ORG_DOCUMENTS;
  const banner = needsYou(data.documents);

  return (
    <div className="space-y-4">
      <BlockedNotice>
        Sample data — this page goes live with 2S1-BE-07 (organizations update their documents after approval).
        Until then you can&rsquo;t see or change your own files here.
      </BlockedNotice>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Documents</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            What {data.organizationName} needs on file to keep selling. BTG is told when you change a document.
          </p>
        </div>
        <button type="button" disabled title={DOCUMENTS_NOT_LIVE}
          className="min-h-11 cursor-not-allowed rounded-lg border border-line px-4 text-xs font-medium text-text opacity-40">
          Add a document
        </button>
      </div>

      {banner && (
        <p role="status" className="rounded-lg border border-warn/45 bg-warn/8 px-3.5 py-2.5 text-xs leading-relaxed">
          <strong className="text-warn">{banner.title}</strong> {banner.body}
        </p>
      )}

      {data.documents.length === 0 ? (
        <EmptyState mark="inbox" title="Nothing on file yet" hint="The documents BTG asks your organization for appear here, with what's on file and what's missing." />
      ) : (
        <OrgDocumentsList data={data} />
      )}

      <p className="text-[11px] text-faint">Only BTG&rsquo;s reviewers can open your documents, and each view is recorded.</p>
    </div>
  );
}
