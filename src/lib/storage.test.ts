import { describe, expect, it } from "vitest";

import {
  attachmentDisposition,
  contentDisposition,
  inlineDisposition,
  responseContentType,
} from "@/lib/storage";

describe("contentDisposition", () => {
  it("names the file after the object basename, slug included", () => {
    expect(attachmentDisposition("library/001-visa-pathways/v1.1-member-visa-pathways.pdf")).toBe(
      'attachment; filename="v1.1-member-visa-pathways.pdf"',
    );
    expect(inlineDisposition("library/001-visa-pathways/v1.1-member-visa-pathways.pdf")).toBe(
      'inline; filename="v1.1-member-visa-pathways.pdf"',
    );
    expect(
      contentDisposition("library/008-biz-plan-builder/v1.1-biz-plan-builder.xlsx", "attachment"),
    ).toBe('attachment; filename="v1.1-biz-plan-builder.xlsx"');
  });

  it("keeps the header safe ASCII", () => {
    expect(attachmentDisposition('library/x/a "b"é.pdf')).toBe('attachment; filename="a__b__.pdf"');
    expect(inlineDisposition('library/x/a "b"é.pdf')).toBe('inline; filename="a__b__.pdf"');
  });

  it("defaults contentDisposition to attachment", () => {
    expect(contentDisposition("library/x/v1.1-member-x.pdf")).toBe(
      'attachment; filename="v1.1-member-x.pdf"',
    );
  });
});

describe("responseContentType", () => {
  it("maps pdf and xlsx extensions", () => {
    expect(responseContentType("library/001-visa-pathways/v1.1-member-visa-pathways.pdf")).toBe(
      "application/pdf",
    );
    expect(responseContentType("library/008-biz-plan-builder/v1.1-biz-plan-builder.xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(responseContentType("library/x/readme.txt")).toBeUndefined();
  });
});
