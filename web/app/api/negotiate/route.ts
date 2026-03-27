import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are CounterPro, an expert real estate negotiation coach helping
everyday people negotiate their own real estate deals without a broker.

Your job is to:
1. Analyze the deal details provided, including any real comparable sales data
2. Recommend a specific counter-offer with clear reasoning grounded in local comps
3. Write ready-to-send negotiation scripts (email and verbal)
4. Identify which contingencies to fight for and which to concede
5. Flag any red flags or leverage points in the deal
6. Tell them clearly when to walk away

Be direct, specific, and practical. Use real numbers from the comps data when available.
Write scripts they can copy and paste. Reference specific comparable sales to justify your counter-offer.
Assume the user has no real estate experience but is intelligent.
Format your response with clear sections using headers.`;

async function fetchRentcastData(address: string) {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) return null;

  const encoded = encodeURIComponent(address);
  const headers = { "X-Api-Key": key, "Accept": "application/json" };

  try {
    const [avmRes, compsRes] = await Promise.all([
      fetch(`https://api.rentcast.io/v1/avm/sale?address=${encoded}`, { headers }),
      fetch(`https://api.rentcast.io/v1/properties/sale-comparables?address=${encoded}&radius=0.5&limit=6&status=Sold`, { headers }),
    ]);

    const avm = avmRes.ok ? await avmRes.json() : null;
    const compsData = compsRes.ok ? await compsRes.json() : null;

    return { avm, comps: compsData?.comparables ?? null };
  } catch {
    return null;
  }
}

function formatCompsSection(data: { avm: any; comps: any[] | null } | null): string {
  if (!data) return "";

  const lines: string[] = ["\n\n---\n## Real Local Market Data (Live)\n"];

  if (data.avm?.price) {
    lines.push(`**AI Estimated Value (AVM):** $${Number(data.avm.price).toLocaleString()}`);
    if (data.avm.priceRangeLow && data.avm.priceRangeHigh) {
      lines.push(`**Value Range:** $${Number(data.avm.priceRangeLow).toLocaleString()} – $${Number(data.avm.priceRangeHigh).toLocaleString()}`);
    }
  }

  if (data.comps && data.comps.length > 0) {
    lines.push(`\n**Recent Comparable Sales (within 0.5 miles):**`);
    data.comps.slice(0, 6).forEach((c: any, i: number) => {
      const price = c.price ? `$${Number(c.price).toLocaleString()}` : "N/A";
      const sqft = c.squareFootage ? `${c.squareFootage} sqft` : "";
      const ppsf = c.price && c.squareFootage ? `($${Math.round(c.price / c.squareFootage)}/sqft)` : "";
      const beds = c.bedrooms ? `${c.bedrooms}bd` : "";
      const baths = c.bathrooms ? `${c.bathrooms}ba` : "";
      const dom = c.daysOnMarket != null ? `${c.daysOnMarket} days on market` : "";
      const date = c.lastSaleDate ? new Date(c.lastSaleDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "";
      const addr = c.formattedAddress ?? c.address ?? "";
      lines.push(`${i + 1}. ${addr} — ${price} ${ppsf} | ${[beds, baths, sqft, dom, date].filter(Boolean).join(" | ")}`);
    });

    const validPrices = data.comps.filter((c: any) => c.price).map((c: any) => c.price);
    if (validPrices.length > 1) {
      const avg = Math.round(validPrices.reduce((a: number, b: number) => a + b, 0) / validPrices.length);
      lines.push(`\n**Average comp sale price:** $${avg.toLocaleString()}`);
    }
    const domsArr = data.comps.filter((c: any) => c.daysOnMarket != null).map((c: any) => c.daysOnMarket);
    if (domsArr.length > 0) {
      const avgDom = Math.round(domsArr.reduce((a: number, b: number) => a + b, 0) / domsArr.length);
      lines.push(`**Average days on market:** ${avgDom} days`);
    }
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

    const marketData = await fetchRentcastData(address);
    const compsSection = formatCompsSection(marketData);

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
${compsSection}

---

Please provide a complete negotiation package including:

1. **Deal Assessment** — Is this a good deal? Where is the leverage? Reference the comp data above.
2. **Recommended Counter-Offer** — Specific number justified by the comps
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
