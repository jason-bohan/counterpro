import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { canUserRunDeal, saveDeal, decrementDealCredit } from "@/lib/db";
import { fetchRentcastPropertyContext, formatRentcastPropertyContext } from "@/lib/property-research";

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

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    const email = user?.emailAddresses?.[0]?.emailAddress ?? "";

    const entitlement = await canUserRunDeal(userId, email);
    if (!entitlement.allowed) {
      return NextResponse.json(
        { error: "payment_required", reason: entitlement.reason },
        { status: 402 }
      );
    }

    const body = await req.json();
    const {
      role, address, propertyType, askingPrice,
      offerAmount, market, timeline, priorities, concerns, extra,
    } = body;

    if (!role || !address || !askingPrice || !offerAmount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const rentcastData = await fetchRentcastPropertyContext(address);
    const formattedContext = formatRentcastPropertyContext(rentcastData);
    const marketSection = formattedContext ? `\n\n---\n${formattedContext}` : "";

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

    // Save deal and deduct credit in parallel
    await Promise.all([
      saveDeal(userId, address, role, Number(askingPrice), Number(offerAmount), text),
      entitlement.reason === "single_deal" ? decrementDealCredit(userId) : Promise.resolve(),
    ]);

    return NextResponse.json({ package: text });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to generate package" }, { status: 500 });
  }
}
