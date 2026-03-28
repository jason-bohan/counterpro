import { sendGmail } from "@/lib/gmail";

export async function sendDraftReadyEmail(
  toEmail: string,
  address: string,
  negotiationId: number,
  draftPreview: string
): Promise<void> {
  // We send from the system Gmail account (GMAIL_USER) using the sales address as From
  const gmailUserId = process.env.GMAIL_SYSTEM_USER_ID;
  if (!gmailUserId) {
    console.error("[notify] GMAIL_SYSTEM_USER_ID not set — cannot send draft-ready email");
    return;
  }

  const subject = `Action needed: Review your AI draft for ${address}`;
  const preview = draftPreview.slice(0, 300);
  const body = `CounterPro received a new message in your negotiation for ${address}.

AI has drafted a response. Review and approve it here:
https://counterproai.com/negotiate/${negotiationId}

Draft preview:
${preview}...

— CounterPro`;

  const from = process.env.GMAIL_SALES_ADDRESS || "sales@counterproai.com";
  await sendGmail(gmailUserId, toEmail, subject, body, from);
}

export async function getClerkUserEmail(clerkUserId: string): Promise<string | null> {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    console.error("[notify] CLERK_SECRET_KEY not set");
    return null;
  }

  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
      headers: {
        Authorization: `Bearer ${clerkSecretKey}`,
      },
    });
    if (!res.ok) {
      console.error("[notify] Clerk user lookup failed", res.status);
      return null;
    }
    const data = await res.json();
    // Find primary email address
    const primaryEmailId: string | null = data.primary_email_address_id ?? null;
    if (!primaryEmailId) return null;
    const emailObj = (data.email_addresses ?? []).find(
      (e: { id: string; email_address: string }) => e.id === primaryEmailId
    );
    return emailObj?.email_address ?? null;
  } catch (err) {
    console.error("[notify] Error fetching Clerk user", err);
    return null;
  }
}
