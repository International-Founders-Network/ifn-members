import { describe, expect, it } from "vitest";
import { getLibraryPersona } from "@ifn/ui";
import keyMap from "../../docs/library-r2-key-map.json";
import { LIBRARY_PLACEMENTS, personaIdFromSegment } from "@/lib/library-placement";

describe("library placements", () => {
  it("matches every key map entry, with global-expansion normalized", () => {
    const expected = Object.fromEntries(
      keyMap.entries.map((e) => [
        e.slug,
        { personaId: personaIdFromSegment(e.segment), stageId: e.stage },
      ]),
    );
    expect(LIBRARY_PLACEMENTS).toEqual(expected);
  });

  it("only uses persona and stage ids from LIBRARY_PERSONAS", () => {
    for (const [slug, { personaId, stageId }] of Object.entries(LIBRARY_PLACEMENTS)) {
      const persona = getLibraryPersona(personaId);
      expect(persona, slug).toBeDefined();
      expect(persona!.stages.map((s) => s.id), slug).toContain(stageId);
    }
  });
});
