import { describe, expect, it } from "vitest";

import { dashboardLink } from "../src/lib/dashboard-link";

/* --------------------------------------------------------------------------
   P1-ART-27 — what the public site's Login / Get Started become for a
   visitor already signed in: their own portal, named for the button.
   -------------------------------------------------------------------------- */

describe("dashboardLink", () => {
  it("names every portal", () => {
    expect(dashboardLink("/admin", ["BTG_ADMIN"])).toEqual({ href: "/admin", label: "Admin Dashboard" });
    expect(dashboardLink("/finance", ["FINANCE"])).toEqual({ href: "/finance", label: "Finance Dashboard" });
    expect(dashboardLink("/sponsor", ["SPONSOR_ADMIN"])).toEqual({ href: "/sponsor", label: "Sponsor Dashboard" });
    expect(dashboardLink("/property", ["PROPERTY_MGR"])).toEqual({ href: "/property", label: "Property Dashboard" });
    expect(dashboardLink("/athlete", ["ATHLETE"])).toEqual({ href: "/athlete", label: "Athlete Dashboard" });
    expect(dashboardLink("/next", ["STUDENT"])).toEqual({ href: "/next", label: "Student Dashboard" });
    expect(dashboardLink("/advisor", ["ADVISOR"])).toEqual({ href: "/advisor", label: "Advisor Dashboard" });
  });

  it("a guardian's athlete portal is named for the guardian", () => {
    expect(dashboardLink("/athlete", ["GUARDIAN"])).toEqual({ href: "/athlete", label: "Guardian Dashboard" });
    expect(dashboardLink("/athlete", ["ATHLETE", "GUARDIAN"])?.label).toBe("Athlete Dashboard");
  });

  it("no portal, or one it doesn't know, keeps Login / Get Started", () => {
    expect(dashboardLink(null, ["SERVICE"])).toBeNull();
    expect(dashboardLink("/somewhere", ["BTG_ADMIN"])).toBeNull();
  });
});
