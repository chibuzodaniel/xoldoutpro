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

// ─── Design system ──────────────────────────────────────────────────────
// Every email in this file shares one look: a near-black canvas, a bordered
// dark card, red as the single accent color, Courier New for the wordmark
// and any numeric/code display. Source: the reference template set the user
// supplied (DECISIONS.md). `shell()` wraps a template's body rows in the
// header/footer every one of them shares; the rest are small building
// blocks (a receipt-style key/value card, a button) reused across templates.
const C = {
  pageBg: "#050505",
  cardBg: "#0A0A0A",
  cardBorder: "#1E1E1E",
  rowBorder: "#1A1A1A",
  boxBg: "#111111",
  red: "#FF2D42",
  green: "#2ED573",
  white: "#FFFFFF",
  body: "#9B9B9B",
  label: "#6B6B6B",
  footer: "#4A4A4A",
  fine: "#5C5C5C",
  value: "#E5E5E5",
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif";
const MONO = "'Courier New',monospace";
const SITE_URL = "https://www.xoldout.app";

// The real app icon (public/xoldout-icon-transparent.png) — the same file
// AppHeader.tsx, the favicon, and the mini-player watermark all already use
// as XOLDOUT's mark — rather than a CSS-styled text wordmark, so every
// place the brand shows up (in-app header, browser tab, email) is the same
// image, not three different approximations of the logo.
function header() {
  return `
    <tr><td style="padding:24px 40px;border-bottom:1px solid ${C.rowBorder};">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;padding-right:8px;"><img src="${SITE_URL}/xoldout-icon-transparent.png" width="28" height="28" alt="XOLDOUT" style="display:block;" /></td>
        <td style="vertical-align:middle;font-family:${FONT};font-size:18px;font-weight:800;letter-spacing:-0.2px;color:${C.white};">XOLDOUT</td>
      </tr></table>
    </td></tr>
  `;
}

function footer(unsubscribeUrl?: string, unsubscribeLabel = "Unsubscribe") {
  const link = unsubscribeUrl
    ? `<a href="${unsubscribeUrl}" style="color:${C.footer};">${unsubscribeLabel}</a>`
    : unsubscribeLabel;
  return `
    <tr><td style="padding:20px 40px 32px;border-top:1px solid ${C.rowBorder};text-align:center;">
      <span style="color:${C.footer};font-size:11px;letter-spacing:1px;">XOLDOUT &middot; Lagos, Nigeria &middot; ${link}</span>
    </td></tr>
  `;
}

/** Wraps a template's body rows in the shared header/card/footer, on a full-bleed dark page background. */
function shell(bodyRows: string, unsubscribeUrl?: string, unsubscribeLabel?: string) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.pageBg};">
      <tr><td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.cardBg};border:1px solid ${C.cardBorder};border-radius:16px;overflow:hidden;font-family:${FONT};">
          ${header()}
          ${bodyRows}
          ${footer(unsubscribeUrl, unsubscribeLabel)}
        </table>
      </td></tr>
    </table>
  `;
}

function button(href: string, label: string, variant: "red" | "white" = "red", fullWidth = false) {
  const bg = variant === "red" ? C.red : C.white;
  const color = variant === "red" ? C.white : C.cardBg;
  const width = fullWidth ? "width:100%;box-sizing:border-box;" : "display:inline-block;";
  return `<a href="${href}" style="${width}${fullWidth ? "" : "display:inline-block;"}text-align:center;background:${bg};color:${color};font-size:14px;font-weight:700;padding:15px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.2px;">${escapeHtml(label)}</a>`;
}

/** The circular icon used at the top of most templates — a glyph ringed in `color`. */
function iconCircle(glyph: string, color: string) {
  return `
    <div style="width:64px;height:64px;margin:0 auto 24px;border-radius:50%;border:2px solid ${color};box-shadow:0 0 24px ${color}59;display:table;">
      <div style="display:table-cell;vertical-align:middle;text-align:center;font-size:26px;color:${color};font-weight:700;">${glyph}</div>
    </div>
  `;
}

/** The dark boxed key/value card with a colored left accent bar — used by every receipt-style template. */
function receiptCard(accentColor: string, rows: { label: string; value: string; mono?: boolean }[]) {
  const rowsHtml = rows
    .map(
      (r, i) => `
      ${i > 0 ? `<tr><td colspan="2" style="border-top:1px solid ${C.cardBorder};padding-top:14px;"></td></tr>` : ""}
      <tr>
        <td style="color:${C.label};font-size:11px;letter-spacing:1px;text-transform:uppercase;padding:${i > 0 ? "14px" : "0"} 0 14px;">${escapeHtml(r.label)}</td>
        <td align="right" style="color:${C.value};font-size:13px;${r.mono ? `font-family:${MONO};` : ""}padding:${i > 0 ? "14px" : "0"} 0 14px;">${r.value}</td>
      </tr>
    `,
    )
    .join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.boxBg};border-radius:10px;overflow:hidden;">
      <tr>
        <td width="4" style="background:${accentColor};"></td>
        <td style="padding:18px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
        </td>
      </tr>
    </table>
  `;
}

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── 01 · Welcome ────────────────────────────────────────────────────────
// Sent once, from POST /api/auth/sync, right after the mirrored Postgres
// User row is created on true first sign-in (email/password or Google —
// this route is the one place both paths converge).
export async function sendWelcomeEmail(input: { to: string; profileUrl: string }): Promise<boolean> {
  const body = `
    <tr><td style="padding:48px 40px 8px;text-align:center;">
      ${iconCircle("X", C.red)}
      <div style="color:${C.white};font-size:24px;font-weight:700;letter-spacing:-0.3px;margin-bottom:10px;">Your XOLDOUT account is live.</div>
      <div style="color:${C.body};font-size:14px;line-height:22px;max-width:400px;margin:0 auto 32px;">
        Upload your music, sell beats and merch, promote your shows, and connect with your fans — all from one place.
      </div>
    </td></tr>
    <tr><td style="padding:0 40px 40px;text-align:center;">${button(input.profileUrl, "Set up your profile")}</td></tr>
  `;
  return sendEmail({ to: input.to, subject: "Your XOLDOUT account is live.", html: shell(body) });
}

// ─── 02/03 · Order confirmation (paid or free) ──────────────────────────
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
  // Which processor settled this — omitted for a ₦0 order, which never
  // reaches one. Only ever "flutterwave" or "monnify" (Payment.processor).
  processor?: string;
  ticket?: TicketInfo | null;
};

// Fire-and-forget from every place an order actually settles: the free-
// purchase path in /api/orders, and lib/commerce/confirmPayment.ts's
// finalizePayment (shared by every processor's webhook) — never let an
// email failure affect the purchase flow itself.
export async function sendOrderConfirmationEmail(input: OrderConfirmationInput) {
  const isFree = input.priceKobo === 0;

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
      <tr><td style="padding:0 40px 32px;">
        <div style="background:${C.boxBg};border-radius:10px;padding:24px;text-align:center;">
          <img src="${qrDataUrl}" width="180" height="180" alt="Ticket QR code" style="background:#ffffff;padding:8px;border-radius:8px;" />
          <p style="margin:18px 0 4px;color:${C.white};font-size:15px;font-weight:700;">${escapeHtml(input.ticket.eventTitle)}</p>
          <p style="margin:0 0 4px;color:${C.label};font-size:12px;">${escapeHtml(input.ticket.tierName)} ticket</p>
          <p style="margin:0 0 14px;color:${C.label};font-size:12px;">${escapeHtml(when)} &middot; ${escapeHtml(where)}</p>
          <p style="margin:0;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${C.red};font-weight:700;">Show this QR code at the door</p>
          <p style="margin:8px 0 0;font-family:${MONO};font-size:11px;color:${C.label};">${escapeHtml(input.ticket.checkInCode)}</p>
        </div>
      </td></tr>
    `;
  }

  const rows = [
    { label: "Reference ID", value: escapeHtml(input.orderId), mono: true },
    { label: "Item", value: escapeHtml(input.productTitle) },
    ...(input.processor ? [{ label: "Processor", value: escapeHtml(input.processor[0].toUpperCase() + input.processor.slice(1)) }] : []),
  ];

  const body = `
    <tr><td style="padding:44px 40px 0;text-align:center;">
      ${iconCircle("&#10003;", C.green)}
      <div style="color:${C.white};font-size:22px;font-weight:700;margin-bottom:6px;">${isFree ? "You're all set" : "Payment successful"}</div>
      <div style="color:${C.body};font-size:14px;margin-bottom:28px;">${isFree ? "Your free item is confirmed." : "Your purchase is confirmed."}</div>
      <div style="color:${C.white};font-family:${MONO};font-size:36px;font-weight:700;letter-spacing:-0.5px;margin-bottom:32px;">${escapeHtml(formatNaira(input.priceKobo))}</div>
    </td></tr>
    <tr><td style="padding:0 40px 32px;">${receiptCard(C.green, rows)}</td></tr>
    ${ticketHtml}
    <tr><td style="padding:0 40px 40px;text-align:center;">${button("https://www.xoldout.app/library", "Go to Library", "white")}</td></tr>
  `;

  await sendEmail({
    to: input.to,
    subject: input.ticket ? `Your ticket: ${input.ticket.eventTitle}` : `Order confirmed: ${input.productTitle}`,
    html: shell(body),
  });
}

// ─── 03 · Payment failed ─────────────────────────────────────────────────
// Fired from finalizePayment's failure branch (a card decline, a mismatched
// amount, or Flutterwave/Monnify itself reporting the transaction failed) —
// the one settlement outcome that previously sent nothing to the buyer at
// all. Nothing was charged (a failed verification never reaches the "grant
// the entitlement" step), so this only ever explains, never refunds.
export async function sendPaymentFailedEmail(input: {
  to: string;
  productTitle: string;
  priceKobo: number;
  orderId: string;
  retryUrl: string;
}): Promise<boolean> {
  const rows = [
    { label: "Reference ID", value: escapeHtml(input.orderId), mono: true },
    { label: "Item", value: escapeHtml(input.productTitle) },
  ];

  const body = `
    <tr><td style="padding:44px 40px 0;text-align:center;">
      ${iconCircle("&#10005;", C.red)}
      <div style="color:${C.white};font-size:22px;font-weight:700;margin-bottom:6px;">Payment didn't go through</div>
      <div style="color:${C.body};font-size:14px;line-height:20px;margin-bottom:28px;max-width:380px;margin-left:auto;margin-right:auto;">
        Nothing was charged. Try again or use a different card.
      </div>
      <div style="color:${C.white};font-family:${MONO};font-size:36px;font-weight:700;letter-spacing:-0.5px;margin-bottom:32px;">${escapeHtml(formatNaira(input.priceKobo))}</div>
    </td></tr>
    <tr><td style="padding:0 40px 32px;">${receiptCard(C.red, rows)}</td></tr>
    <tr><td style="padding:0 40px 16px;">${button(input.retryUrl, "Try again", "red", true)}</td></tr>
    <tr><td style="padding:0 40px 40px;text-align:center;"><a href="https://www.xoldout.app/socials" style="color:${C.body};font-size:13px;text-decoration:none;">Contact support &rarr;</a></td></tr>
  `;

  return sendEmail({ to: input.to, subject: `Payment didn't go through: ${input.productTitle}`, html: shell(body) });
}

// ─── 04 · Sale notification (creator payout) ────────────────────────────
// Fired from finalizePayment's success branch, alongside the existing
// in-app SALE notification — the first time a creator gets an *email* the
// moment they make a sale, not just an in-app badge. Shows the net amount
// actually credited (gross minus the 15% commission, lib/commerce/ledger.ts
// COMMISSION_RATE), since that's what "added to your wallet" honestly means —
// showing the gross price here would overstate it.
export async function sendSaleNotificationEmail(input: {
  to: string;
  productTitle: string;
  buyerHandle: string;
  netAmountKobo: number;
  walletBalanceKobo: number;
  walletUrl: string;
}): Promise<boolean> {
  const rows = [
    { label: "Buyer", value: `@${escapeHtml(input.buyerHandle)}` },
    { label: "Wallet balance", value: escapeHtml(formatNaira(input.walletBalanceKobo)), mono: true },
  ];

  const body = `
    <tr><td style="padding:40px 40px 0;">
      <div style="color:${C.red};font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-bottom:14px;">New sale</div>
      <div style="color:${C.white};font-size:24px;font-weight:700;line-height:32px;margin-bottom:24px;">Someone just copped &quot;${escapeHtml(input.productTitle)}&quot;.</div>
      <div style="color:${C.white};font-family:${MONO};font-size:40px;font-weight:700;letter-spacing:-0.5px;margin-bottom:4px;">+ ${escapeHtml(formatNaira(input.netAmountKobo))}</div>
      <div style="color:${C.label};font-size:13px;margin-bottom:32px;">Added to your wallet</div>
    </td></tr>
    <tr><td style="padding:0 40px 32px;">${receiptCard(C.red, rows)}</td></tr>
    <tr><td style="padding:0 40px 40px;text-align:center;">${button(input.walletUrl, "View earnings", "white")}</td></tr>
  `;

  return sendEmail({ to: input.to, subject: `New sale: ${input.productTitle}`, html: shell(body) });
}

// ─── 07 · Weekly/monthly/yearly best-sellers digest ─────────────────────
export type DigestKind = "weekly" | "monthly" | "yearly";

const DIGEST_PERIOD_LABEL: Record<DigestKind, string> = {
  weekly: "This Week's",
  monthly: "This Month's",
  yearly: "This Year's",
};

type DigestTopSong = { title: string; artistName: string; artworkUrl: string | null; href: string; soldInWindow: number };
type DigestProduct = { title: string; creatorName: string; imageUrl: string | null; href: string; priceLabel: string };

// Opt-in only (User.emailDigestSubscribed) — sent by the cron at
// /api/internal/send-digests, one kind at a time depending on the day. Keeps
// its existing two-section shape (a highlighted top song, then a numbered
// "recommended" list) rather than forcing it into the reference's single
// ranked-chart layout — this digest's actual data (one top song plus
// unrelated recommended products) doesn't carry play-count rankings for a
// real chart, so the numbered-row treatment is applied to what it does have.
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
      <tr><td style="padding:0 40px 28px;">
        <div style="color:${C.red};font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:700;margin-bottom:14px;">${escapeHtml(periodLabel)} top song</div>
        <a href="${input.topSong.href}" style="display:block;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.boxBg};border-radius:10px;">
            <tr>
              ${input.topSong.artworkUrl ? `<td width="64" style="padding:14px 0 14px 14px;"><img src="${input.topSong.artworkUrl}" width="56" height="56" alt="" style="border-radius:8px;object-fit:cover;display:block;" /></td>` : ""}
              <td style="padding:14px 20px;">
                <div style="color:${C.white};font-size:15px;font-weight:700;">${escapeHtml(input.topSong.title)}</div>
                <div style="color:${C.label};font-size:13px;margin-top:2px;">${escapeHtml(input.topSong.artistName)}</div>
                <div style="color:${C.label};font-size:12px;margin-top:2px;">${input.topSong.soldInWindow.toLocaleString("en-NG")} sold</div>
              </td>
            </tr>
          </table>
        </a>
      </td></tr>
    `
    : "";

  const recommendedHtml =
    input.recommended.length > 0
      ? `
      <tr><td style="padding:0 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.rowBorder};">
          ${input.recommended
            .map(
              (p, i) => `
            <tr>
              <td style="width:32px;padding:16px 0;color:${i === 0 ? C.red : C.label};font-family:${MONO};font-size:14px;font-weight:700;vertical-align:middle;">${String(i + 1).padStart(2, "0")}</td>
              <td style="padding:16px 0;${i < input.recommended.length - 1 ? `border-bottom:1px solid ${C.rowBorder};` : ""}vertical-align:middle;">
                <a href="${p.href}" style="display:flex;align-items:center;gap:12px;text-decoration:none;">
                  ${p.imageUrl ? `<img src="${p.imageUrl}" width="40" height="40" alt="" style="border-radius:6px;object-fit:cover;flex-shrink:0;" />` : ""}
                  <span>
                    <span style="display:block;color:${C.white};font-size:14px;font-weight:700;">${escapeHtml(p.title)}</span>
                    <span style="display:block;color:${C.label};font-size:12px;">${escapeHtml(p.creatorName)} &middot; ${escapeHtml(p.priceLabel)}</span>
                  </span>
                </a>
              </td>
            </tr>
          `,
            )
            .join("")}
        </table>
      </td></tr>
    `
      : "";

  const body = `
    <tr><td style="padding:36px 40px 24px;">
      <div style="color:${C.white};font-size:22px;font-weight:700;margin-bottom:6px;">${escapeHtml(periodLabel)} best on XOLDOUT</div>
      <div style="color:${C.body};font-size:14px;">Hey ${escapeHtml(input.displayName)}, here's what's selling.</div>
    </td></tr>
    ${topSongHtml}
    ${recommendedHtml}
    <tr><td style="padding:28px 40px 0;">&nbsp;</td></tr>
  `;

  await sendEmail({
    to: input.to,
    subject: `${periodLabel} best-sellers on XOLDOUT`,
    html: shell(body, input.unsubscribeUrl, "Unsubscribe from weekly digest"),
  });
}

// ─── 06 · Moderator step-up OTP ──────────────────────────────────────────
// Second factor for /moderation — same account/inbox as a moderator's
// regular XOLDOUT login, just this one extra step that route specifically
// requires on top of that.
export async function sendModeratorOtpEmail(input: { to: string; displayName: string; code: string }): Promise<boolean> {
  const digitsHtml = input.code
    .split("")
    .map(
      (d, i) => `
      ${i > 0 ? `<td width="8"></td>` : ""}
      <td style="width:48px;height:56px;background:${C.boxBg};border:1px solid ${C.red};border-radius:8px;text-align:center;vertical-align:middle;color:${C.white};font-family:${MONO};font-size:26px;font-weight:700;">${escapeHtml(d)}</td>
    `,
    )
    .join("");

  const body = `
    <tr><td style="padding:48px 40px 8px;text-align:center;">
      <div style="color:${C.white};font-size:22px;font-weight:700;margin-bottom:10px;">Your verification code</div>
      <div style="color:${C.body};font-size:14px;line-height:22px;margin-bottom:32px;">Hey ${escapeHtml(input.displayName)}, enter this code to finish signing into the XOLDOUT moderation dashboard. It expires in 10 minutes.</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 8px;"><tr>${digitsHtml}</tr></table>
      <div style="color:${C.fine};font-size:12px;margin:24px 0 32px;">Never share this code. XOLDOUT staff will never ask for it.</div>
    </td></tr>
  `;
  return sendEmail({ to: input.to, subject: `${input.code} is your moderation dashboard code`, html: shell(body) });
}

// ─── 05 · Password reset ─────────────────────────────────────────────────
// Sent from POST /api/auth/reset-password, which generates `resetLink` via
// firebase-admin's generatePasswordResetLink server-side — Firebase's own
// client-triggered reset email is plain text with a raw URL and no way to
// style it, so this route sends its own branded email through Resend instead.
export async function sendPasswordResetEmail(input: { to: string; resetLink: string }): Promise<boolean> {
  const body = `
    <tr><td style="padding:48px 40px 8px;text-align:center;">
      ${iconCircle("&#9084;", "#3B3B3B")}
      <div style="color:${C.white};font-size:22px;font-weight:700;margin-bottom:10px;">Reset your password</div>
      <div style="color:${C.body};font-size:14px;line-height:22px;max-width:380px;margin:0 auto 32px;">
        We got a request to reset the password for your XOLDOUT account (${escapeHtml(input.to)}). This link works once and expires in 1 hour.
      </div>
    </td></tr>
    <tr><td style="padding:0 40px 16px;text-align:center;">${button(input.resetLink, "Reset password")}</td></tr>
    <tr><td style="padding:0 40px 40px;text-align:center;"><span style="color:${C.fine};font-size:12px;">Didn't request this? Ignore this email — your password stays the same.</span></td></tr>
  `;
  return sendEmail({ to: input.to, subject: "Reset your XOLDOUT password", html: shell(body) });
}

// ─── 08 · Account deleted (general/catch-all shape) ─────────────────────
const RECOVERY_WINDOW_DAYS = 45;

// Sent once, synchronously, from DELETE /api/me — recoveryUrl points at
// /recoveraccount/[handle], where signing back in as this account within
// the window clears User.deletedAt. After the window, self-service recovery
// closes and only a moderator can restore the account.
export async function sendAccountDeletedEmail(input: { to: string; displayName: string; recoveryUrl: string }): Promise<boolean> {
  const body = `
    <tr><td style="padding:44px 40px 4px;">
      <div style="color:${C.red};font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-bottom:14px;">Account update</div>
      <div style="color:${C.white};font-size:22px;font-weight:700;line-height:30px;margin-bottom:14px;">Your account has been deleted</div>
      <div style="color:${C.body};font-size:14px;line-height:22px;margin-bottom:32px;">
        Hey ${escapeHtml(input.displayName)}, this confirms your account was deleted. Changed your mind? You have <strong style="color:${C.value};">${RECOVERY_WINDOW_DAYS} days</strong> from today to recover it by signing back in.
      </div>
    </td></tr>
    <tr><td style="padding:0 40px 16px;">${button(input.recoveryUrl, "Recover my account", "red", true)}</td></tr>
    <tr><td style="padding:0 40px 40px;text-align:center;">
      <span style="color:${C.fine};font-size:12px;">After ${RECOVERY_WINDOW_DAYS} days, only a XOLDOUT moderator can restore it. Didn't request this? Contact support.</span>
    </td></tr>
  `;
  return sendEmail({ to: input.to, subject: "Your XOLDOUT account has been deleted", html: shell(body) });
}
