import { describe, expect, it } from "vitest";

import { brandStyle, logoPublicUrl, readableTextColor } from "@/lib/branding";
import { createCustomFieldSchema, customAnswersSchema, type CustomField } from "@/schemas/custom-fields";

const field = (overrides: Partial<CustomField>): CustomField => ({
  id: crypto.randomUUID(),
  label: "Question",
  help_text: null,
  field_type: "short_text",
  options: [],
  required: false,
  ...overrides,
});

describe("customAnswersSchema", () => {
  it("requires required answers and drops empty optional ones", () => {
    const required = field({ required: true });
    const optional = field({});
    const schema = customAnswersSchema([required, optional]);

    const missing = schema.safeParse({ [required.id]: "  ", [optional.id]: "" });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0].path).toEqual([required.id]);

    expect(schema.parse({ [required.id]: " Hello ", [optional.id]: "" })).toEqual({ [required.id]: "Hello" });
  });

  it("checks multiple choice against the options", () => {
    const select = field({ field_type: "select", options: ["AI", "Design"] });
    const schema = customAnswersSchema([select]);
    expect(schema.safeParse({ [select.id]: "Cooking" }).success).toBe(false);
    expect(schema.parse({ [select.id]: "AI" })).toEqual({ [select.id]: "AI" });
  });

  it("normalises links and rejects junk", () => {
    const url = field({ field_type: "url" });
    const schema = customAnswersSchema([url]);
    expect(schema.parse({ [url.id]: "acme.com/kit" })).toEqual({ [url.id]: "https://acme.com/kit" });
    expect(schema.safeParse({ [url.id]: "javascript:alert(1)" }).success).toBe(false);
  });

  it("handles required and optional checkboxes", () => {
    const consent = field({ field_type: "checkbox", required: true });
    const extra = field({ field_type: "checkbox" });
    const schema = customAnswersSchema([consent, extra]);
    expect(schema.safeParse({ [consent.id]: false }).success).toBe(false);
    expect(schema.parse({ [consent.id]: true, [extra.id]: false })).toEqual({ [consent.id]: true });
  });

  it("ignores answers to questions the guest wasn't shown", () => {
    const q = field({});
    const stray = crypto.randomUUID();
    expect(customAnswersSchema([q]).parse({ [q.id]: "a", [stray]: "b" })).toEqual({ [q.id]: "a" });
  });

  it("enforces length limits", () => {
    const short = field({});
    expect(customAnswersSchema([short]).safeParse({ [short.id]: "x".repeat(501) }).success).toBe(false);
  });
});

describe("createCustomFieldSchema", () => {
  const base = { orgId: crypto.randomUUID(), label: "Topic", helpText: "", required: false };

  it("splits options by line and de-duplicates them", () => {
    const parsed = createCustomFieldSchema.parse({
      ...base,
      fieldType: "select",
      options: "AI\n\nDesign\nAI ",
    });
    expect(parsed.options).toEqual(["AI", "Design"]);
  });

  it("needs options for multiple choice", () => {
    const result = createCustomFieldSchema.safeParse({ ...base, fieldType: "select", options: "  " });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["options"]);
  });
});

describe("branding", () => {
  it("picks readable text on the brand colour", () => {
    expect(readableTextColor("#ffffff")).toBe("#000000");
    expect(readableTextColor("#1e1b4b")).toBe("#ffffff");
    expect(readableTextColor("#facc15")).toBe("#000000");
  });

  it("only themes with valid colours", () => {
    expect(brandStyle(null)).toBeUndefined();
    expect(brandStyle("red")).toBeUndefined();
    expect(brandStyle("#4f46e5")).toMatchObject({
      "--primary": "#4f46e5",
      "--primary-foreground": "#ffffff",
    });
  });

  it("builds public logo URLs", () => {
    expect(logoPublicUrl(null)).toBeNull();
    expect(logoPublicUrl("org/logo a.png")).toMatch(
      /\/storage\/v1\/object\/public\/org-branding\/org\/logo%20a\.png$/,
    );
  });
});
