import { describe, it, expect } from "vitest";
import {
  ALL_BRANDS_SENTINEL,
  isAllBrandsAccessUser,
  userHasBrandAccess,
  filterBrandScoped,
} from "./brandAccess";

describe("isAllBrandsAccessUser", () => {
  it("bypasses for Super Admin / Admin / Dev user_type", () => {
    expect(isAllBrandsAccessUser({ user_type: ["Super Admin"], brand_ids: [] })).toBe(true);
    expect(isAllBrandsAccessUser({ user_type: ["Admin"], brand_ids: [] })).toBe(true);
    expect(isAllBrandsAccessUser({ user_type: ["Dev"], brand_ids: [] })).toBe(true);
  });

  it("bypasses for the All-Brands sentinel in custom_role_types", () => {
    expect(
      isAllBrandsAccessUser({
        user_type: ["Custom"],
        brand_ids: [],
        custom_role_types: [`${ALL_BRANDS_SENTINEL}:CS`],
      })
    ).toBe(true);
  });

  it("does not bypass a plain Custom user without the sentinel", () => {
    expect(
      isAllBrandsAccessUser({
        user_type: ["Custom"],
        brand_ids: ["brand-1"],
        custom_role_types: ["brand-1:CS"],
      })
    ).toBe(false);
  });

  it("handles missing/null user gracefully", () => {
    expect(isAllBrandsAccessUser(null)).toBe(false);
    expect(isAllBrandsAccessUser(undefined)).toBe(false);
    expect(isAllBrandsAccessUser({})).toBe(false);
  });
});

describe("userHasBrandAccess", () => {
  it("matches a plain brand_ids entry", () => {
    const user = { user_type: ["Custom"], brand_ids: ["brand-1", "brand-2"] };
    expect(userHasBrandAccess(user, "brand-1")).toBe(true);
    expect(userHasBrandAccess(user, "brand-3")).toBe(false);
  });

  it("always true for an All-Brands sentinel user regardless of brandId", () => {
    const user = {
      user_type: ["Custom"],
      brand_ids: [],
      custom_role_types: [`${ALL_BRANDS_SENTINEL}:CS`],
    };
    expect(userHasBrandAccess(user, "any-brand-created-later")).toBe(true);
  });

  it("always true for a bypass user_type regardless of brandId", () => {
    const user = { user_type: ["Super Admin"], brand_ids: [] };
    expect(userHasBrandAccess(user, "any-brand")).toBe(true);
  });

  it("emptyMeansAll=false (default): empty brand_ids excludes everything", () => {
    const user = { user_type: ["Custom"], brand_ids: [] };
    expect(userHasBrandAccess(user, "brand-1")).toBe(false);
    expect(userHasBrandAccess(user, "brand-1", { emptyMeansAll: false })).toBe(false);
  });

  it("emptyMeansAll=true: empty brand_ids includes everything", () => {
    const user = { user_type: ["Custom"], brand_ids: [] };
    expect(userHasBrandAccess(user, "brand-1", { emptyMeansAll: true })).toBe(true);
  });
});

describe("filterBrandScoped", () => {
  const items = [
    { id: "brand-1", name: "A" },
    { id: "brand-2", name: "B" },
  ];

  it("returns all items for an All-Brands user", () => {
    const user = {
      user_type: ["Custom"],
      brand_ids: [],
      custom_role_types: [`${ALL_BRANDS_SENTINEL}:CS`],
    };
    expect(filterBrandScoped(user, items, (i) => i.id)).toEqual(items);
  });

  it("filters down to matching brand_ids for a scoped user", () => {
    const user = { user_type: ["Custom"], brand_ids: ["brand-2"] };
    expect(filterBrandScoped(user, items, (i) => i.id)).toEqual([items[1]]);
  });

  it("respects emptyMeansAll for a scoped-empty user", () => {
    const user = { user_type: ["Custom"], brand_ids: [] };
    expect(filterBrandScoped(user, items, (i) => i.id)).toEqual([]);
    expect(filterBrandScoped(user, items, (i) => i.id, { emptyMeansAll: true })).toEqual(items);
  });
});
