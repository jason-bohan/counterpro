import { sendGmail } from "@/lib/gmail";

// ── Clerk user lookup ──────────────────────────────────────────────────────

export type ClerkUser = {
  email: string;
  firstName: string;
};

export async function getClerkUser(clerkUserId: string): Promise<ClerkUser | null> {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    console.error("[notify] CLERK_SECRET_KEY not set");
    return null;
  }
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
      headers: { Authorization: `Bearer ${clerkSecretKey}` },
    });
    if (!res.ok) {
      console.error("[notify] Clerk user lookup failed", res.status);
      return null;
    }
    const data = await res.json();
    const primaryEmailId: string | null = data.primary_email_address_id ?? null;
    if (!primaryEmailId) return null;
    const emailObj = (data.email_addresses ?? []).find(
      (e: { id: string; email_address: string }) => e.id === primaryEmailId
    );
    if (!emailObj) return null;
    return {
      email: emailObj.email_address,
      firstName: data.first_name || "there",
    };
  } catch (err) {
    console.error("[notify] Error fetching Clerk user", err);
    return null;
  }
}

/** @deprecated use getClerkUser */
export async function getClerkUserEmail(clerkUserId: string): Promise<string | null> {
  const user = await getClerkUser(clerkUserId);
  return user?.email ?? null;
}

// ── Email templates ────────────────────────────────────────────────────────

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:40px 0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <div style="background:#0f172a;padding:20px 32px;display:flex;align-items:center;gap:8px;">
      <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.5px;">CounterPro</span>
      <span style="color:#64748b;font-size:12px;margin-left:4px;">AI Negotiation Suite</span>
    </div>
    <div style="padding:32px;">
      ${content}
    </div>
    <div style="padding:16px 32px;border-top:1px solid #f1f5f9;background:#fafafa;">
      <p style="margin:0;color:#94a3b8;font-size:12px;">
        CounterPro &mdash; AI-powered real estate negotiation &mdash;
        <a href="https://counterproai.com" style="color:#94a3b8;">counterproai.com</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;margin-top:4px;">${label}</a>`;
}

function previewBox(label: string, text: string): string {
  return `<div style="background:#f8fafc;border-left:3px solid #6366f1;border-radius:0 6px 6px 0;padding:16px;margin:20px 0;">
    <p style="margin:0 0 8px;color:#6366f1;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${label}</p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;white-space:pre-wrap;">${text}</p>
  </div>`;
}

// ── Notification senders ───────────────────────────────────────────────────

async function sendNotification(toEmail: string, subject: string, text: string, html: string): Promise<void> {
  const gmailUserId = process.env.GMAIL_SYSTEM_USER_ID;
  if (!gmailUserId) {
    console.error("[notify] GMAIL_SYSTEM_USER_ID not set");
    return;
  }
  const from = process.env.GMAIL_SALES_ADDRESS || "sales@counterproai.com";
  await sendGmail(gmailUserId, toEmail, subject, text, from, undefined, html);
}

export async function sendDraftReadyEmail(
  toEmail: string,
  address: string,
  negotiationId: number,
  draftPreview: string,
  firstName = "there",
  counterpartyEmail?: string | null
): Promise<void> {
  const preview = draftPreview.slice(0, 400);
  const url = `https://counterproai.com/negotiate/${negotiationId}`;
  const fromLine = counterpartyEmail ? ` from <strong>${counterpartyEmail}</strong>` : "";

  const subject = `New reply on ${address} — review your AI draft`;

  const text = `Hi ${firstName},

You received a new message${counterpartyEmail ? ` from ${counterpartyEmail}` : ""} in your negotiation for ${address}.

AI has drafted a response. Review and approve it here:
${url}

Draft preview:
${preview}${draftPreview.length > 400 ? "..." : ""}

— CounterPro`;

  const html = emailWrapper(`
    <p style="margin:0 0 6px;font-size:16px;color:#0f172a;">Hi ${firstName},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
      You received a new message${fromLine} in your negotiation for <strong>${address}</strong>.
      AI has drafted a response for your review.
    </p>
    ${previewBox("AI Draft Preview", preview + (draftPreview.length > 400 ? "…" : ""))}
    ${ctaButton(url, "Review & approve →")}
    <p style="margin:20px 0 0;font-size:13px;color:#94a3b8;">
      You can edit the draft before sending. Nothing goes out until you approve it.
    </p>
  `);

  await sendNotification(toEmail, subject, text, html);
}

export async function sendAutonomousUpdateEmail(
  toEmail: string,
  address: string,
  negotiationId: number,
  sentPreview: string,
  firstName = "there",
  counterpartyEmail?: string | null
): Promise<void> {
  const preview = sentPreview.slice(0, 400);
  const url = `https://counterproai.com/negotiate/${negotiationId}`;

  const subject = `CounterPro replied on your behalf — ${address}`;

  const text = `Hi ${firstName},

CounterPro automatically replied to a message${counterpartyEmail ? ` from ${counterpartyEmail}` : ""} in your negotiation for ${address}.

What was sent:
${preview}${sentPreview.length > 400 ? "..." : ""}

Review the thread or turn off auto-pilot:
${url}

— CounterPro`;

  const fromLine = counterpartyEmail ? ` from ${counterpartyEmail}` : "";

  const html = emailWrapper(`
    <p style="margin:0 0 6px;font-size:16px;color:#0f172a;">Hi ${firstName},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
      CounterPro automatically replied to a message${fromLine} in your negotiation for <strong>${address}</strong>.
    </p>
    ${previewBox("What was sent", preview + (sentPreview.length > 400 ? "…" : ""))}
    ${ctaButton(url, "View thread →")}
    <p style="margin:20px 0 0;font-size:13px;color:#94a3b8;">
      Auto-pilot is active. To review the next response yourself, open the thread and turn off the auto-pilot toggle.
    </p>
  `);

  await sendNotification(toEmail, subject, text, html);
}
