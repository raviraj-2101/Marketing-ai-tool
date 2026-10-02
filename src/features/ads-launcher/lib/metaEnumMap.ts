export function objectiveMetaToLabel(v: string | null | undefined): "Sales" | "Leads" | "Traffic" | undefined {
  if (!v) return undefined;
  switch (v.toUpperCase()) {
    case "OUTCOME_SALES":
    case "CONVERSIONS":
    case "PRODUCT_CATALOG_SALES":
      return "Sales";
    case "OUTCOME_LEADS":
    case "LEAD_GENERATION":
      return "Leads";
    case "OUTCOME_TRAFFIC":
    case "LINK_CLICKS":
      return "Traffic";
    default:
      return undefined;
  }
}

export function buyingTypeMetaToLabel(v: string | null | undefined): "Auction" | "Reach and frequency" | undefined {
  if (!v) return undefined;
  const u = v.toUpperCase();
  if (u === "AUCTION") return "Auction";
  if (u === "RESERVED" || u === "REACH_AND_FREQUENCY") return "Reach and frequency";
  return undefined;
}

export function optimizationMetaToLabel(
  v: string | null | undefined,
): "Maximize number of conversions" | "Maximize value of conversions" | "Maximize landing page views" | undefined {
  if (!v) return undefined;
  switch (v.toUpperCase()) {
    case "OFFSITE_CONVERSIONS":
    case "CONVERSIONS":
      return "Maximize number of conversions";
    case "VALUE":
      return "Maximize value of conversions";
    case "LANDING_PAGE_VIEWS":
      return "Maximize landing page views";
    default:
      return undefined;
  }
}

export function attributionMetaToLabel(
  v: string | null | undefined,
): "7-day click or 1-day view" | "1-day click" | "7-day click" | undefined {
  if (!v) return undefined;
  const u = v.toLowerCase().replace(/[-_\s]/g, "");
  if (u === "7dclick1dview" || u === "7dclickor1dview") return "7-day click or 1-day view";
  if (u === "1dclick") return "1-day click";
  if (u === "7dclick") return "7-day click";
  return undefined;
}
