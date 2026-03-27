import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are CounterPro, an expert real estate negotiation coach helping
everyday people negotiate their own real estate deals without a broker.

Your job is to:
1. Analyze the deal details provided, including any real market and property data
2. Recommend a specific counter-offer with clear reasoning grounded in the local market data
3. Write ready-to-send negotiation scripts (email and verbal)
4. Identify which contingencies to fight for and which to concede
5. Flag any red flags or leverage points in the deal
6. Tell them clearly when to walk away

Be direct, specific, and practical. Use real numbers from the market data when available.
Write scripts they can copy and paste. Reference specific market stats to justify your counter-offer.
Assume the user has no real estate experience but is intelligent.
Format your response with clear sections using headers.`;

async function fetchRentcastData(address: string) {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) return null;

  const encoded = encodeURIComponent(address);
  const headers = { "X-Api-Key": key, "Accept": "application/json" };

  try {
    // Step 1: get property details (includes zip code, beds/baths/sqft, last sale)
    const propRes = await fetch(`https://api.rentcast.io/v1/properties?address=${encoded}`, { headers });
    if (!propRes.ok) return null;

    const propList = await propRes.json();
    const prop = Array.isArray(propList) ? propList[0] : propList;
    if (!prop?.zipCode) return null;

    // Step 2: get zip-level market stats
    const mktRes = await fetch(`https://api.rentcast.io/v1/markets?zipCode=${prop.zipCode}`, { headers });
    const market = mktRes.ok ? await mktRes.json() : null;

    // Step 3: pull last sale price from property history if available
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

function formatMarketSection(data: { prop: any; market: any; lastSalePrice: number | null } | null): string {
  if (!data) return "";

  const { prop, market, lastSalePrice } = data;
  const lines: string[] = ["\n\n---\n## Live Property & Market Data\n"];

  // Property facts
  const propFacts = [
    prop.bedrooms && `${prop.bedrooms} bed`,
    prop.bathrooms && `${prop.bathrooms} bath`,
    prop.squareFootage && `${prop.squareFootage.toLocaleString()} sqft`,
    prop.yearBuilt && `built ${prop.yearBuilt}`,
    prop.propertyType,
  ].filter(Boolean).join(" · ");
  if (propFacts) lines.push(`**Property:** ${propFacts}`);

  if (prop.lotSize) lines.push(`**Lot size:** ${prop.lotSize.toLocaleString()} sqft`);

  if (lastSalePrice && prop.lastSaleDate) {
    const date = new Date(prop.lastSaleDate).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    lines.push(`**Last sold:** $${lastSalePrice.toLocaleString()} (${date})`);
    if (prop.squareFootage) {
      lines.push(`**Last sale $/sqft:** $${Math.round(lastSalePrice / prop.squareFootage)}`);
    }
  }

  // Tax assessment trend
  if (prop.taxAssessments) {
    const years = Object.keys(prop.taxAssessments).sort();
    const latest = years[years.length - 1];
    const prev = years[years.length - 2];
    if (latest && prop.taxAssessments[latest]?.value) {
      lines.push(`**${latest} tax assessed value:** $${prop.taxAssessments[latest].value.toLocaleString()}`);
      if (prev && prop.taxAssessments[prev]?.value) {
        const change = prop.taxAssessments[latest].value - prop.taxAssessments[prev].value;
        const pct = ((change / prop.taxAssessments[prev].value) * 100).toFixed(1);
        lines.push(`**Year-over-year assessment change:** ${change >= 0 ? "+" : ""}${pct}%`);
      }
    }
  }

  // Notable features
  const feats = [];
  if (prop.features?.pool) feats.push("pool");
  if (prop.features?.garage) feats.push(`${prop.features.garageSpaces ?? 1}-car garage`);
  if (prop.features?.fireplace) feats.push("fireplace");
  if (prop.hoa?.fee) feats.push(`HOA $${prop.hoa.fee}/mo`);
  if (feats.length) lines.push(`**Notable features:** ${feats.join(", ")}`);

  // Zip-level market stats
  if (market?.saleData) {
    const s = market.saleData;
    lines.push(`\n**${prop.zipCode} Zip Code Market Stats:**`);
    if (s.medianPrice) lines.push(`- Median sale price: $${Number(s.medianPrice).toLocaleString()}`);
    if (s.averagePrice) lines.push(`- Average sale price: $${Number(s.averagePrice).toLocaleString()}`);
    if (s.medianPricePerSquareFoot) lines.push(`- Median $/sqft: $${s.medianPricePerSquareFoot.toFixed(0)}`);
    if (s.medianDaysOnMarket != null) lines.push(`- Median days on market: ${s.medianDaysOnMarket} days`);
    if (s.averageDaysOnMarket != null) lines.push(`- Average days on market: ${s.averageDaysOnMarket.toFixed(0)} days`);
    if (s.totalListings) lines.push(`- Active listings in zip: ${s.totalListings}`);
  }

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      role, address, propertyType, askingPrice,
      offerAmount, market, timeline, priorities, concerns, extra,
    } = body;

    if (!role || !address || !askingPrice || !offerAmount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const rentcastData = await fetchRentcastData(address);
    const marketSection = formatMarketSection(rentcastData);

    const prompt = `
## Deal Details

**I am the:** ${role}
**Property:** ${address} (${propertyType})
**Asking price:** $${Number(askingPrice).toLocaleString()}
**Offer amount:** $${Number(offerAmount).toLocaleString()}
**Market conditions:** ${market}
**My timeline:** ${timeline}
**My priorities:** ${priorities}
**My concerns:** ${concerns}
${extra ? `**Additional context:** ${extra}` : ""}
${marketSection}

---

Please provide a complete negotiation package including:

1. **Deal Assessment** — Is this a good deal? Where is the leverage? Reference the market data above.
2. **Recommended Counter-Offer** — Specific number justified by the local market stats
3. **Key Terms to Negotiate** — Contingencies, closing date, inclusions, concessions
4. **Email Script** — Ready to send, copy and paste
5. **Verbal Script** — What to say if negotiating by phone or in person
6. **Red Flags** — Anything I should watch out for
7. **Walk Away Point** — At what point should I walk away?
`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ package: text });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to generate package" }, { status: 500 });
  }
}
