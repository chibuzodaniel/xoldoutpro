import QRCode from "qrcode";

// Order/ticket confirmation emails via Resend's HTTP API — a plain fetch,
// no SDK dependency needed. Silently no-ops (logs and returns) when
// RESEND_API_KEY/EMAIL_FROM aren't configured, so nothing breaks before
// those are set up in the environment.
const RESEND_API_URL = "https://api.resend.com/emails";

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Returns whether the email actually went out — callers that need to tell a user "sent" vs. "something went wrong" check this instead of assuming success. */
export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.log(`[email] RESEND_API_KEY/EMAIL_FROM not configured — skipping "${subject}" to ${to}`);
    return false;
  }
  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error("[email] Resend send failed", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Resend send threw", err);
    return false;
  }
}

type TicketInfo = {
  checkInCode: string;
  tierName: string;
  eventTitle: string;
  venue: string | null;
  isVirtual: boolean;
  startsAt: Date;
};

type OrderConfirmationInput = {
  to: string;
  buyerName: string;
  orderId: string;
  productTitle: string;
  priceKobo: number;
  ticket?: TicketInfo | null;
};

// Fire-and-forget from the two places an order actually settles (the free-
// purchase path in /api/orders and the Flutterwave webhook) — never let an
// email failure affect the purchase flow itself.
export async function sendOrderConfirmationEmail(input: OrderConfirmationInput) {
  const priceLabel = input.priceKobo === 0 ? "Free" : `₦${(input.priceKobo / 100).toLocaleString("en-NG")}`;

  let ticketHtml = "";
  if (input.ticket) {
    // Generated well above the email's 200x200 display size so a recipient
    // who pinch-zooms or screenshots-and-zooms the email at the door still
    // gets a scannable, non-blurry code.
    const qrDataUrl = await QRCode.toDataURL(input.ticket.checkInCode, { margin: 1, width: 512 });
    const when = input.ticket.startsAt.toLocaleString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const where = input.ticket.isVirtual ? "Virtual event" : (input.ticket.venue ?? "Venue TBA");
    ticketHtml = `
      <div style="margin-top:24px;padding:20px;border:1px solid #2a2a2a;border-radius:12px;text-align:center;">
        <img src="${qrDataUrl}" width="200" height="200" alt="Ticket QR code" style="background:#ffffff;padding:8px;border-radius:8px;" />
        <p style="margin:16px 0 4px;font-weight:600;">${escapeHtml(input.ticket.eventTitle)}</p>
        <p style="margin:0 0 4px;color:#888888;font-size:13px;">${escapeHtml(input.ticket.tierName)} ticket</p>
        <p style="margin:0 0 12px;color:#888888;font-size:13px;">${escapeHtml(when)} &middot; ${escapeHtml(where)}</p>
        <p style="margin:0;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#e11d48;font-weight:600;">
          Show this QR code at the door
        </p>
        <p style="margin:8px 0 0;font-size:11px;color:#888888;">Code: ${escapeHtml(input.ticket.checkInCode)}</p>
      </div>
    `;
  }

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;color:#111111;">
      <h1 style="font-size:20px;">Thanks for your order${input.buyerName ? `, ${escapeHtml(input.buyerName)}` : ""}!</h1>
      <p style="color:#555555;font-size:14px;">Here's your confirmation from XOLDOUT.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px;">
        <tr><td style="padding:8px 0;color:#888888;">Order</td><td style="padding:8px 0;text-align:right;">${escapeHtml(input.orderId)}</td></tr>
        <tr><td style="padding:8px 0;color:#888888;">Item</td><td style="padding:8px 0;text-align:right;">${escapeHtml(input.productTitle)}</td></tr>
        <tr><td style="padding:8px 0;color:#888888;">Total</td><td style="padding:8px 0;text-align:right;">${escapeHtml(priceLabel)}</td></tr>
      </table>
      ${ticketHtml}
      <p style="margin-top:24px;font-size:12px;color:#999999;">You can always find this in your Library in the app.</p>
    </div>
  `;

  await sendEmail({
    to: input.to,
    subject: input.ticket ? `Your ticket: ${input.ticket.eventTitle}` : `Order confirmed: ${input.productTitle}`,
    html,
  });
}

export type DigestKind = "weekly" | "monthly" | "yearly";

const DIGEST_PERIOD_LABEL: Record<DigestKind, string> = {
  weekly: "This Week's",
  monthly: "This Month's",
  yearly: "This Year's",
};

type DigestTopSong = { title: string; artistName: string; artworkUrl: string | null; href: string; soldInWindow: number };
type DigestProduct = { title: string; creatorName: string; imageUrl: string | null; href: string; priceLabel: string };

// Opt-in only (User.emailDigestSubscribed) — sent by the cron at
// /api/internal/send-digests, one kind at a time depending on the day.
// No template engine/React Email dependency, same raw-HTML-string approach
// as sendOrderConfirmationEmail above.
export async function sendDigestEmail(input: {
  to: string;
  displayName: string;
  kind: DigestKind;
  topSong: DigestTopSong | null;
  recommended: DigestProduct[];
  unsubscribeUrl: string;
}) {
  const periodLabel = DIGEST_PERIOD_LABEL[input.kind];

  const topSongHtml = input.topSong
    ? `
      <div style="margin-top:20px;padding:20px;border:1px solid #2a2a2a;border-radius:12px;">
        <p style="margin:0 0 12px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#e11d48;font-weight:600;">
          ${escapeHtml(periodLabel)} Top Song
        </p>
        <a href="${input.topSong.href}" style="display:flex;align-items:center;gap:14px;text-decoration:none;color:inherit;">
          ${
            input.topSong.artworkUrl
              ? `<img src="${input.topSong.artworkUrl}" width="64" height="64" alt="" style="border-radius:8px;object-fit:cover;flex-shrink:0;" />`
              : ""
          }
          <span>
            <span style="display:block;font-weight:600;font-size:15px;">${escapeHtml(input.topSong.title)}</span>
            <span style="display:block;color:#888888;font-size:13px;">${escapeHtml(input.topSong.artistName)}</span>
            <span style="display:block;color:#888888;font-size:12px;margin-top:2px;">${input.topSong.soldInWindow} sold</span>
          </span>
        </a>
      </div>
    `
    : "";

  const recommendedHtml =
    input.recommended.length > 0
      ? `
      <p style="margin:28px 0 12px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#888888;font-weight:600;">
        Recommended for you
      </p>
      <table style="width:100%;border-collapse:collapse;">
        ${input.recommended
          .map(
            (p) => `
          <tr>
            <td style="padding:8px 0;">
              <a href="${p.href}" style="display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit;">
                ${
                  p.imageUrl
                    ? `<img src="${p.imageUrl}" width="48" height="48" alt="" style="border-radius:6px;object-fit:cover;flex-shrink:0;" />`
                    : ""
                }
                <span>
                  <span style="display:block;font-weight:600;font-size:13px;">${escapeHtml(p.title)}</span>
                  <span style="display:block;color:#888888;font-size:12px;">${escapeHtml(p.creatorName)} &middot; ${escapeHtml(p.priceLabel)}</span>
                </span>
              </a>
            </td>
          </tr>
        `,
          )
          .join("")}
      </table>
    `
      : "";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;color:#111111;">
      <h1 style="font-size:20px;">${escapeHtml(periodLabel)} best on XOLDOUT</h1>
      <p style="color:#555555;font-size:14px;">Hey ${escapeHtml(input.displayName)}, here's what's selling.</p>
      ${topSongHtml}
      ${recommendedHtml}
      <p style="margin-top:32px;font-size:11px;color:#999999;">
        You're getting this because you subscribed to XOLDOUT digest emails.
        <a href="${input.unsubscribeUrl}" style="color:#999999;">Unsubscribe</a>
      </p>
    </div>
  `;

  await sendEmail({ to: input.to, subject: `${periodLabel} best-sellers on XOLDOUT`, html });
}

// Second factor for /moderation — same account/inbox as a moderator's
// regular XOLDOUT login, just this one extra step that route requires.
export async function sendModeratorOtpEmail(input: { to: string; displayName: string; code: string }): Promise<boolean> {
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;color:#111111;">
      <h1 style="font-size:20px;">Your moderation dashboard code</h1>
      <p style="color:#555555;font-size:14px;">Hey ${escapeHtml(input.displayName)}, use this code to finish signing into the XOLDOUT moderation dashboard.</p>
      <p style="margin:24px 0;font-size:32px;font-weight:700;letter-spacing:6px;text-align:center;">${escapeHtml(input.code)}</p>
      <p style="color:#999999;font-size:12px;">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
    </div>
  `;
  return sendEmail({ to: input.to, subject: `${input.code} is your moderation dashboard code`, html });
}

// Sent from POST /api/auth/reset-password, which generates `resetLink` via
// firebase-admin's generatePasswordResetLink server-side — Firebase's own
// client-triggered reset email is plain text with a raw URL and no way to
// style it, so this route sends its own branded email through Resend instead,
// same pattern as every other transactional email in this file.
export async function sendPasswordResetEmail(input: { to: string; resetLink: string }): Promise<boolean> {
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;color:#111111;">
      <h1 style="font-size:20px;">Reset your password</h1>
      <p style="color:#555555;font-size:14px;">
        We got a request to reset the password for your XOLDOUT account (${escapeHtml(input.to)}).
      </p>
      <p style="margin:20px 0;">
        <a href="${input.resetLink}" style="display:inline-block;background:#e11d48;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;">
          Reset password
        </a>
      </p>
      <p style="color:#999999;font-size:12px;">
        This link expires in 1 hour. If you didn't request this, you can ignore this email — your password won't change.
      </p>
    </div>
  `;
  return sendEmail({ to: input.to, subject: "Reset your XOLDOUT password", html });
}

const RECOVERY_WINDOW_DAYS = 45;

// Sent once, synchronously, from DELETE /api/me — recoveryUrl points at
// /recoveraccount/[handle], where signing back in as this account within
// the window clears User.deletedAt. After the window, self-service recovery
// closes and only a moderator can restore the account.
export async function sendAccountDeletedEmail(input: { to: string; displayName: string; recoveryUrl: string }): Promise<boolean> {
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;color:#111111;">
      <h1 style="font-size:20px;">Your XOLDOUT account has been deleted</h1>
      <p style="color:#555555;font-size:14px;">Hey ${escapeHtml(input.displayName)}, this confirms your account was deleted.</p>
      <p style="color:#555555;font-size:14px;">
        Changed your mind? You have <strong>${RECOVERY_WINDOW_DAYS} days</strong> from today to recover it by signing back in here:
      </p>
      <p style="margin:20px 0;">
        <a href="${input.recoveryUrl}" style="display:inline-block;background:#e11d48;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;">
          Recover my account
        </a>
      </p>
      <p style="color:#999999;font-size:12px;">
        After ${RECOVERY_WINDOW_DAYS} days, this link stops working and the account can only be restored by a XOLDOUT moderator.
        If you didn't request this deletion, contact support as soon as possible.
      </p>
    </div>
  `;
  return sendEmail({ to: input.to, subject: "Your XOLDOUT account has been deleted", html });
}
