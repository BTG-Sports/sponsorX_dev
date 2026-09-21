import { describe, expect, it } from "vitest";
import { CHAPTERS, SECTION_COUNT, chapterById } from "@/lib/landing-chapters";

describe("CHAPTERS", () => {
  it("has 6 sections: hero, 4 sports, finale", () => {
    expect(SECTION_COUNT).toBe(6);
    expect(CHAPTERS.map((c) => c.id)).toEqual([
      "hero", "soccer", "basketball", "baseball", "football", "finale",
    ]);
  });
  it("indexes are 0..5 in order", () => {
    CHAPTERS.forEach((c, i) => expect(c.index).toBe(i));
  });
  it("sports carry a ball + environment asset; hero/finale differ", () => {
    const soccer = chapterById("soccer");
    expect(soccer.kind).toBe("sport");
    expect(soccer.ball).toBe("ball-soccer.glb");
    expect(soccer.env).toBe("env-soccer-goal.glb");
    expect(chapterById("hero").ball).toBeNull(); // procedural orb
    expect(chapterById("finale").ball).toBe("brand-x.glb");
  });
  it("football is the prolate/squash chapter", () => {
    expect(chapterById("football").squash).toBe(true);
  });
  it("accents alternate per approved design (blue/orange throughline)", () => {
    expect(chapterById("soccer").accent).toBe("blue");
    expect(chapterById("basketball").accent).toBe("orange");
    expect(chapterById("baseball").accent).toBe("blue");
    expect(chapterById("football").accent).toBe("orange");
  });
});
