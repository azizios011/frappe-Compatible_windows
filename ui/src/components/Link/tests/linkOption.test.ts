import { describe, expect, it } from "vitest";
import { isTypedSearch, toIdOption, toLinkOption } from "../linkOption";

describe("toLinkOption", () => {
  it("leaves the record's name out of a titled option's description", () => {
    expect(
      toLinkOption({ value: "62e34b24e4", label: "tabPartner", description: "62e34b24e4, frappe.io" })
    ).toEqual({ value: "62e34b24e4", label: "tabPartner", description: "frappe.io" });
  });

  it("drops a description that held only the name, and labels an untitled option by its name", () => {
    expect(toLinkOption({ value: "2i3h26h74o", description: "2i3h26h74o" })).toEqual({
      value: "2i3h26h74o",
      label: "2i3h26h74o",
      description: undefined,
    });
  });
});

describe("toIdOption", () => {
  it("labels a titled record by its ID and moves the title into the description", () => {
    expect(
      toIdOption({ value: "9500", label: "Rebate calculation", description: "9500, Open, jo@example.com" })
    ).toEqual({ value: "9500", label: "9500", description: "Rebate calculation, Open, jo@example.com" });
  });

  it("labels an untitled record by its ID with no description", () => {
    expect(toIdOption({ value: "9500", description: "9500" })).toEqual({
      value: "9500",
      label: "9500",
      description: undefined,
    });
  });
});

describe("isTypedSearch", () => {
  // The frappe-ui Combobox in input mode re-emits the committed option's
  // LABEL through update:query — once on select (the list still open) and
  // again on close (display sync) — resets it to "" and re-emits focus as a
  // raw event. None of those may trigger the server reload.
  const label = "Commerce de detail";

  it("ignores the label echoed on select while the list is still open", () => {
    expect(isTypedSearch(label, { open: true, selectedLabel: label })).toBe(false);
  });

  it("ignores the label echoed again by the close display sync", () => {
    expect(isTypedSearch(label, { open: false, selectedLabel: label })).toBe(false);
  });

  it("ignores the empty display reset", () => {
    expect(isTypedSearch("", { open: true, selectedLabel: null })).toBe(false);
  });

  it("ignores non-string payloads (a re-emitted focus event)", () => {
    expect(isTypedSearch(undefined, { open: true, selectedLabel: null })).toBe(false);
    expect(isTypedSearch(42, { open: true, selectedLabel: null })).toBe(false);
    expect(isTypedSearch({ query: label }, { open: true, selectedLabel: null })).toBe(false);
  });

  it("ignores everything that arrives while the list is closed", () => {
    expect(isTypedSearch("par", { open: false, selectedLabel: null })).toBe(false);
  });

  it("lets real typing search", () => {
    expect(isTypedSearch("par", { open: true, selectedLabel: label })).toBe(true);
    expect(isTypedSearch("Commerce", { open: true, selectedLabel: null })).toBe(true);
  });
});
