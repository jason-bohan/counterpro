type RentcastProperty = Record<string, any>;
type RentcastMarket = Record<string, any> | null;

export type RentcastPropertyContext = {
  prop: RentcastProperty;
  market: RentcastMarket;
  lastSalePrice: number | null;
} | null;

export async function fetchRentcastPropertyContext(address: string): Promise<RentcastPropertyContext> {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) return null;

  const encoded = encodeURIComponent(address);
  const headers = { "X-Api-Key": key, Accept: "application/json" };

  try {
    const propRes = await fetch(`https://api.rentcast.io/v1/properties?address=${encoded}`, { headers });
    if (!propRes.ok) return null;

    const propList = await propRes.json();
    const prop = Array.isArray(propList) ? propList[0] : propList;
    if (!prop?.zipCode) return null;

    const mktRes = await fetch(`https://api.rentcast.io/v1/markets?zipCode=${prop.zipCode}`, { headers });
    const market = mktRes.ok ? await mktRes.json() : null;

    let lastSalePrice: number | null = null;
    if (prop.propertyHistory) {
      const sales = Object.values(prop.propertyHistory as Record<string, any>)
        .filter((h: any) => h.event === "Sale" && h.price)
        .sort((a: any, b: any) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
      if (sales.length > 0) lastSalePrice = (sales[0] as any).price;
    }

    return { prop, market, lastSalePrice };
  } catch {
    return null;
  }
}

export function formatRentcastPropertyContext(data: RentcastPropertyContext): string {
  if (!data) return "";

  const { prop, market, lastSalePrice } = data;
  const lines: string[] = ["## Live Property & Market Data"];

  const propFacts = [
    prop.bedrooms && `${prop.bedrooms} bed`,
    prop.bathrooms && `${prop.bathrooms} bath`,
    prop.squareFootage && `${prop.squareFootage.toLocaleString()} sqft`,
    prop.yearBuilt && `built ${prop.yearBuilt}`,
    prop.propertyType,
  ].filter(Boolean).join(" · ");
  if (propFacts) lines.push(`Property: ${propFacts}`);

  if (prop.lotSize) lines.push(`Lot size: ${prop.lotSize.toLocaleString()} sqft`);

  if (lastSalePrice && prop.lastSaleDate) {
    const date = new Date(prop.lastSaleDate).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    lines.push(`Last sold: $${lastSalePrice.toLocaleString()} (${date})`);
    if (prop.squareFootage) {
      lines.push(`Last sale $/sqft: $${Math.round(lastSalePrice / prop.squareFootage)}`);
    }
  }

  if (prop.taxAssessments) {
    const years = Object.keys(prop.taxAssessments).sort();
    const latest = years[years.length - 1];
    const prev = years[years.length - 2];
    if (latest && prop.taxAssessments[latest]?.value) {
      lines.push(`${latest} tax assessed value: $${prop.taxAssessments[latest].value.toLocaleString()}`);
      if (prev && prop.taxAssessments[prev]?.value) {
        const change = prop.taxAssessments[latest].value - prop.taxAssessments[prev].value;
        const pct = ((change / prop.taxAssessments[prev].value) * 100).toFixed(1);
        lines.push(`Year-over-year assessment change: ${change >= 0 ? "+" : ""}${pct}%`);
      }
    }
  }

  const feats = [];
  if (prop.features?.pool) feats.push("pool");
  if (prop.features?.garage) feats.push(`${prop.features.garageSpaces ?? 1}-car garage`);
  if (prop.features?.fireplace) feats.push("fireplace");
  if (prop.hoa?.fee) feats.push(`HOA $${prop.hoa.fee}/mo`);
  if (feats.length) lines.push(`Notable features: ${feats.join(", ")}`);

  if (market?.saleData) {
    const s = market.saleData;
    lines.push(`${prop.zipCode} Zip Code Market Stats:`);
    if (s.medianPrice) lines.push(`- Median sale price: $${Number(s.medianPrice).toLocaleString()}`);
    if (s.averagePrice) lines.push(`- Average sale price: $${Number(s.averagePrice).toLocaleString()}`);
    if (s.medianPricePerSquareFoot) lines.push(`- Median $/sqft: $${s.medianPricePerSquareFoot.toFixed(0)}`);
    if (s.medianDaysOnMarket != null) lines.push(`- Median days on market: ${s.medianDaysOnMarket} days`);
    if (s.averageDaysOnMarket != null) lines.push(`- Average days on market: ${s.averageDaysOnMarket.toFixed(0)} days`);
    if (s.totalListings) lines.push(`- Active listings in zip: ${s.totalListings}`);
  }

  return lines.join("\n");
}

export function buildPropertyDetailsDocument(address: string, data: RentcastPropertyContext): string {
  const context = formatRentcastPropertyContext(data);
  if (!context) {
    return `Property details\n\nAddress: ${address}\n\nNo live property details were available for this address at the time of lookup.`;
  }

  return [
    "Property details",
    "",
    `Address: ${address}`,
    `Generated: ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`,
    "",
    context,
  ].join("\n");
}
