import { clerkClient } from "@clerk/nextjs/server";
import { getAccessToken, sendGmail } from "@/lib/gmail";

type ClerkUserSummary = {
  email: string;
  firstName: string | null;
};

export async function getClerkUser(userId: string): Promise<ClerkUserSummary | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const primaryEmailId = user.primaryEmailAddressId;
    const primaryEmail =
      user.emailAddresses.find(email => email.id === primaryEmailId)?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null;

    if (!primaryEmail) return null;

    return {
      email: primaryEmail,
      firstName: user.firstName ?? null,
    };
  } catch (error) {
    console.error("[notify] Failed to load Clerk user:", error);
    return null;
  }
}

export async function sendNegotiationResultEmail(opts: {
  clerkUserId: string;
  to: string;
  firstName?: string | null;
  address: string;
  negotiationId: number;
  agreedPrice?: number | null;
  counterpartyLabel?: string | null;
}): Promise<void> {
  const sendAsUserId = (await getAccessToken(opts.clerkUserId))
    ? opts.clerkUserId
    : process.env.GMAIL_SYSTEM_USER_ID;

  if (!sendAsUserId) {
    console.warn("[notify] No Gmail sender available; skipping negotiation result email");
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://counterproai.com";
  const threadUrl = `${appUrl}/negotiate/${opts.negotiationId}`;
  const from = process.env.GMAIL_SALES_ADDRESS ?? "CounterPro <notifications@counterproai.com>";
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : "Hi,";
  const priceLine = opts.agreedPrice
    ? `Agreed price: $${opts.agreedPrice.toLocaleString()}`
    : "A verbal agreement was detected in the negotiation.";
  const counterpartyLine = opts.counterpartyLabel
    ? `Counterparty: ${opts.counterpartyLabel}`
    : null;

  const text = [
    greeting,
    "",
    `CounterPro detected that a deal was reached for ${opts.address}.`,
    priceLine,
    counterpartyLine,
    "",
    `Review the thread: ${threadUrl}`,
    "",
    "Auto-pilot has been paused for this negotiation to prevent unnecessary follow-up messages.",
  ]
    .filter(Boolean)
    .join("\n");

  const sent = await sendGmail(
    sendAsUserId,
    opts.to,
    `Deal reached: ${opts.address}`,
    text,
    from,
  );

  if (!sent) {
    throw new Error("Failed to send negotiation result email via Gmail");
  }
}

export async function sendNegotiationActivityCopyEmail(opts: {
  clerkUserId: string;
  negotiationId: number;
  address: string;
  direction: "sent" | "received";
  message: string;
  counterpartyLabel?: string | null;
}): Promise<void> {
  const user = await getClerkUser(opts.clerkUserId);
  if (!user) return;

  const sendAsUserId = (await getAccessToken(opts.clerkUserId))
    ? opts.clerkUserId
    : process.env.GMAIL_SYSTEM_USER_ID;

  if (!sendAsUserId) {
    console.warn("[notify] No Gmail sender available; skipping activity copy email");
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://counterproai.com";
  const threadUrl = `${appUrl}/negotiate/${opts.negotiationId}`;
  const from = process.env.GMAIL_SALES_ADDRESS ?? "CounterPro <notifications@counterproai.com>";
  const directionLabel = opts.direction === "sent" ? "Sent message copy" : "Received message copy";
  const counterpartyLine = opts.counterpartyLabel ? `Counterparty: ${opts.counterpartyLabel}` : null;

  const text = [
    user.firstName ? `Hi ${user.firstName},` : "Hi,",
    "",
    `${directionLabel} for ${opts.address}.`,
    counterpartyLine,
    "",
    "Message:",
    opts.message,
    "",
    `View thread: ${threadUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  await sendGmail(
    sendAsUserId,
    user.email,
    `${directionLabel}: ${opts.address}`,
    text,
    from,
  );
}
