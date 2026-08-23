import QRCode from "qrcode";

// Order/ticket confirmation emails via Resend's HTTP API — a plain fetch,
// no SDK dependency needed. Silently no-ops (logs and returns) when
// RESEND_API_KEY/EMAIL_FROM aren't configured, so nothing breaks before
// those are set up in the environment.
const RESEND_API_URL = "https://api.resend.com/emails";

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.log(`[email] RESEND_API_KEY/EMAIL_FROM not configured — skipping "${subject}" to ${to}`);
    return;
  }
  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error("[email] Resend send failed", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("[email] Resend send threw", err);
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
