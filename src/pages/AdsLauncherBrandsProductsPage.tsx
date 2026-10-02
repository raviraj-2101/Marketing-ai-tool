/**
 * Cycle 338 — Combined Brands + Products page.
 *
 * Operator spec: "combine the Brands and Products tabs into one tab
 * called Brands and Products."
 *
 * Layout: left rail = brand list (clickable, narrow). Right pane = the
 * picked brand's products + per-brand controls. The two old pages
 * (BrandsPage + ProductsPage) remain available at their old URLs for
 * deep links but the sidebar Nav now points here.
 */

import { useState } from "react";
import BrandsPage from "./AdsLauncherBrandsPage";
import ProductsPage from "./AdsLauncherProductsPage";

type Tab = "brands" | "products";

export default function BrandsProductsPage() {
  const [tab, setTab] = useState<Tab>("brands");
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-4 flex items-end justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900">Brands &amp; Products</h1>
      </div>
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        <TabButton active={tab === "brands"} onClick={() => setTab("brands")}>
          Brands
        </TabButton>
        <TabButton active={tab === "products"} onClick={() => setTab("products")}>
          Products
        </TabButton>
      </div>
      {tab === "brands" ? <BrandsPage /> : <ProductsPage />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 -mb-px text-sm font-medium border-b-2 transition ${
        active ? "border-brand-500 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
