import { describe, expect, it } from "vitest";

import { photoFileProblem, PHOTO_UPLOAD } from "../src/lib/athlete-photo";
import { blockLines, homeButtons, homeHeadline, missingLine, type HomeFeatureStatus } from "../src/lib/home-feature";

/* --------------------------------------------------------------------------
   P8-FE-10 — BTG's "Home page" section shows whether the athlete is on the
   Featured athletes panel and, if not, every reason (the missing fields by
   name, "Under 18 — waiting for approval"); the buttons follow the API's
   rules (pinning a removed athlete is refused; approval is for a minor
   only). The photo is checked in the browser before the upload.
   -------------------------------------------------------------------------- */

const status = (over: Partial<HomeFeatureStatus> = {}): HomeFeatureStatus => ({
  athleteId: "ath_1",
  onHomePage: false,
  eligible: false,
  blocks: [],
  missing: [],
  minor: false,
  pinned: false,
  removed: false,
  approved: false,
  photoUrl: null,
  ...over,
});

describe("why an athlete is off the home page", () => {
  it("names the missing fields in the profile's order", () => {
    expect(missingLine(["school", "photo"])).toBe("Missing: photo, school");
    expect(missingLine(["socialFollowers", "contentCapabilities"])).toBe("Missing: content they can make, a social account with followers");
    expect(missingLine([])).toBe("");
  });

  it("gives every reason, a minor's included", () => {
    const s = status({ blocks: ["incomplete", "minor_not_approved"], missing: ["photo", "school"], minor: true });
    expect(blockLines(s)).toEqual(["Missing: photo, school", "Under 18 or no age on file — waiting for approval"]);
    expect(homeHeadline(s)).toMatchObject({ tone: "warn", label: "Not on the home page", hint: "Missing: photo, school · Under 18 or no age on file — waiting for approval" });
  });

  it("says when BTG removed them, and when they aren't active", () => {
    expect(blockLines(status({ blocks: ["removed", "not_active"] }))).toEqual(["Removed from the home page by BTG", "Not an active athlete"]);
  });

  it("tells a qualifying athlete outside the four from one on the panel", () => {
    expect(homeHeadline(status({ eligible: true })).label).toBe("Qualifies · not in the top four");
    expect(homeHeadline(status({ eligible: true, onHomePage: true, pinned: true }))).toMatchObject({ tone: "accent", label: "On the home page · pinned" });
  });
});

describe("the buttons", () => {
  const actions = (s: HomeFeatureStatus) => homeButtons(s).map((b) => b.action);

  it("offers pin and remove to an adult, and no approval", () => {
    expect(actions(status())).toEqual(["pin", "remove"]);
  });

  it("swaps to unpin and restore, and won't pin a removed athlete", () => {
    expect(actions(status({ pinned: true }))).toEqual(["unpin", "remove"]);
    const removed = homeButtons(status({ removed: true }));
    expect(removed.map((b) => b.action)).toEqual(["pin", "restore"]);
    expect(removed[0].disabled).toBe("Restore this athlete first.");
  });

  it("offers approval for a minor, then withdrawal", () => {
    expect(actions(status({ minor: true }))).toEqual(["pin", "remove", "approve"]);
    expect(actions(status({ minor: true, approved: true }))).toEqual(["pin", "remove", "unapprove"]);
  });
});

describe("the photo file", () => {
  it("takes a JPEG, PNG or WebP of at most 5 MB", () => {
    for (const type of PHOTO_UPLOAD.types) expect(photoFileProblem({ type, size: 1024 })).toBeNull();
    expect(photoFileProblem({ type: "image/jpeg", size: PHOTO_UPLOAD.maxBytes })).toBeNull();
  });

  it("names the problem otherwise", () => {
    expect(photoFileProblem({ type: "image/gif", size: 1024 })).toBe("Use a JPEG, PNG or WebP photo.");
    expect(photoFileProblem({ type: "image/png", size: 0 })).toBe("That file is empty.");
    expect(photoFileProblem({ type: "image/png", size: PHOTO_UPLOAD.maxBytes + 1 })).toBe("That photo is over 5 MB. Use a smaller one.");
  });
});
