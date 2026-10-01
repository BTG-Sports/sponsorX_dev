import { EmptyState, ErrorPanel, SkeletonPage } from "@/components/states";
import { OrgDocumentsPage } from "@/components/org-documents";
import { demoState } from "@/lib/demo";
import type { ApiOrgDocuments } from "@/lib/org-documents-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Documents — 2S1-FE-04, the documents half (Claude Design
   OrgDocuments.dc.html, views list / replace). The property manager's
   organization documents after approval: what's on file, what has expired
   or is missing, earlier files, and replacing or adding one. Live on
   2S1-BE-07:

     Reads  GET    /property/documents
     Writes POST   /property/documents                       (a private-bucket PUT, sent by the browser)
            POST   /property/documents/:documentId/confirm
            DELETE /property/documents/:documentId
            — server actions in ./actions.ts

   The API scopes every call to the signed-in manager's own property, keeps
   each earlier file as history, re-runs the checklist and emails BTG; a
   required document removed without a replacement flags the organization
   for BTG and leaves its listings live. A property that didn't join through
   the onboarding wizard (BTG's own) has no documents here — the API's 404.
   ?demo=loading|empty|error renders the branded states.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PropertyDocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("property");
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  let res: Response;
  try {
    res = await apiFetch("/property/documents");
  } catch {
    return <ErrorPanel title="Documents didn't load" hint="We couldn't reach SponsorX. Reload the page in a minute." />;
  }
  if (res.status === 404 || res.status === 403) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Documents</h1>
        <EmptyState mark="inbox" title="No documents to keep here" hint="This property didn't join through the onboarding wizard, so BTG holds its paperwork. Contact BTG to change it." />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Documents didn't load (${res.status}).`);
  const data = (await res.json()) as ApiOrgDocuments;
  const shown = demo === "empty" ? { ...data, documents: [], pending: [] } : data;

  return (
    <div className="space-y-4">
      {shown.documents.length === 0 ? (
        <>
          <h1 className="text-xl font-semibold tracking-tight">Documents</h1>
          <EmptyState mark="inbox" title="Nothing on file yet" hint="The documents BTG asks your organization for appear here, with what's on file and what's missing." />
        </>
      ) : (
        <OrgDocumentsPage initial={shown} />
      )}
      <p className="text-[11px] text-faint">Only BTG&rsquo;s reviewers can open your documents, and each view is recorded.</p>
    </div>
  );
}
