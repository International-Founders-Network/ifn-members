import { describe, expect, it } from "vitest";

import { attachmentDisposition } from "@/lib/storage";

describe("attachmentDisposition", () => {
  it("names the download after the object basename, slug included", () => {
    expect(attachmentDisposition("library/001-visa-pathways/v1.1-member-visa-pathways.pdf")).toBe(
      'attachment; filename="v1.1-member-visa-pathways.pdf"',
    );
    expect(attachmentDisposition("library/008-biz-plan-builder/v1.1-biz-plan-builder.xlsx")).toBe(
      'attachment; filename="v1.1-biz-plan-builder.xlsx"',
    );
  });

  it("keeps the header safe ASCII", () => {
    expect(attachmentDisposition('library/x/a "b"é.pdf')).toBe('attachment; filename="a__b__.pdf"');
  });
});
