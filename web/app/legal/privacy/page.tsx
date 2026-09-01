import type { Metadata } from "next";
import Link from "next/link";
import { BackHeader } from "@/components/ui/BackHeader";
import { LegalProse } from "@/components/legal/LegalProse";

export const metadata: Metadata = {
  title: "Privacy Policy — XOLDOUT",
};

// Draft content covering XOLDOUT's actual data flows (Firebase Auth, Bachs
// payments/payouts, Cloudflare R2 uploads, Resend email, moderator-reviewed
// verification documents). Written to be accurate to what the app does
// today, not boilerplate — but this is a starting point, not legal advice.
// Have a lawyer review before treating it as final, particularly the
// Nigeria Data Protection Act (NDPR) section, and fill in a real
// support-inbox address below if support@xoldout.app isn't it.
const EFFECTIVE_DATE = "September 1, 2026";
const SUPPORT_EMAIL = "support@xoldout.app";

export default function PrivacyPolicyPage() {
  return (
    <div className="pb-16">
      <BackHeader title="Privacy Policy" />
      <div className="px-4 max-w-2xl mx-auto">
        <p className="text-[11px] uppercase tracking-widest text-ink-3 mb-6">Effective {EFFECTIVE_DATE}</p>

        <LegalProse>
          <p>
            This Privacy Policy explains what information XOLDOUT (&quot;XOLDOUT,&quot; &quot;we,&quot; &quot;us&quot;) collects
            through the XOLDOUT app and website (the &quot;Service&quot;), how we use it, and the choices you have. By using
            the Service you agree to the practices described here.
          </p>

          <h2>1. Information we collect</h2>

          <h3>Account information</h3>
          <p>
            When you sign up, we collect your email address and, via Firebase Authentication, a unique account
            identifier. You choose a handle, display name, and optional bio, avatar, cover photo, tags, and social
            media links, all of which are visible on your public profile.
          </p>

          <h3>Verification information</h3>
          <p>
            If you apply for a verification badge (Identity, Seller, Creator, Official, Business, or Fanbase), we
            collect additional information needed to review that application: legal name, date of birth, country and
            region, phone number, and — for identity or business verification — a government-issued ID and a selfie.
            This information is reviewed only by XOLDOUT moderators for the purpose of deciding your application and
            is not shown publicly or sold to anyone.
          </p>

          <h3>Content you provide</h3>
          <p>
            Music, artwork, merchandise photos, event listings, beats, social posts, Fanbase group messages, and
            anything else you upload or write is stored so the Service can display it to the audience you intend
            (public, your buyers, or a private Fanbase group).
          </p>

          <h3>Payment and payout information</h3>
          <p>
            Purchases and payouts are processed by <strong>Bachs</strong>, a third-party payment processor. XOLDOUT
            does not receive or store your full card number, bank login, or BVN — Bachs handles that directly. To pay
            creators out, we store the payout bank account details you add (bank name, account number, verified
            account name) so a withdrawal can be routed to the right place.
          </p>

          <h3>Usage and device information</h3>
          <p>
            We collect basic technical information — IP address, browser/device type, and, if you enable them, push
            notification tokens — to keep the Service secure, diagnose problems, and deliver notifications you&apos;ve
            opted into.
          </p>

          <h3>Cookies and local storage</h3>
          <p>
            The Service uses browser local storage and similar technologies to keep you signed in and remember
            lightweight preferences. We don&apos;t use third-party advertising trackers.
          </p>

          <h2>2. How we use information</h2>
          <ul>
            <li>To operate the Service: creating your account, processing purchases and payouts, and delivering the content you buy.</li>
            <li>To communicate with you: order confirmations, security alerts, moderation decisions, and — if you&apos;ve opted in — the email digest of best-selling releases.</li>
            <li>To review verification applications and respond to reports of abusive or infringing content.</li>
            <li>To keep the Service secure and prevent fraud, including on payment and payout flows.</li>
            <li>To improve the Service, understand aggregate usage, and fix bugs.</li>
          </ul>

          <h2>3. How we share information</h2>
          <p>We share information only where it&apos;s needed to run the Service:</p>
          <ul>
            <li><strong>Bachs</strong> — to process payments and payouts.</li>
            <li><strong>Firebase (Google)</strong> — to authenticate your account and, if enabled, deliver push notifications.</li>
            <li><strong>Cloudflare</strong> — to store the media (audio, images) you upload.</li>
            <li><strong>Resend</strong> — to deliver transactional and digest emails.</li>
            <li><strong>XOLDOUT moderators</strong> (internal staff) — to review verification applications and act on reports.</li>
            <li><strong>Other users</strong> — your public profile, listings, posts, and Fanbase group activity are visible to the audience that content is intended for.</li>
            <li><strong>Legal authorities</strong> — if required by law, or to protect the rights, safety, or property of XOLDOUT or others.</li>
          </ul>
          <p>We do not sell your personal information.</p>

          <h2>4. Your rights and choices</h2>
          <p>
            Depending on where you live — including under Nigeria&apos;s Data Protection Act 2023 — you may have the
            right to access, correct, or delete your personal information, and to object to certain processing. You
            can:
          </p>
          <ul>
            <li>Edit your profile information at any time from Edit Profile.</li>
            <li>Unsubscribe from the email digest from Edit Profile, or via the link in any digest email.</li>
            <li>Turn push notifications on or off from Edit Profile.</li>
            <li>Delete your account from Edit Profile — this signs you out everywhere immediately. You have 45 days to recover it before it&apos;s permanently disabled.</li>
          </ul>
          <p>
            To make any other request about your personal information, contact us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>

          <h2>5. Data retention</h2>
          <p>
            We keep your account information for as long as your account is active, plus the 45-day recovery window
            after deletion. Verification documents are retained only as long as needed to support the badge they were
            submitted for and to resolve any dispute about it. Financial records related to sales, commissions, and
            payouts are kept as required for accounting and legal purposes.
          </p>

          <h2>6. Children&apos;s privacy</h2>
          <p>
            The Service is not directed at children under 13, and buying or selling on XOLDOUT requires being old
            enough, under the law that applies to you, to enter into a binding contract. We don&apos;t knowingly
            collect personal information from children under 13.
          </p>

          <h2>7. Security</h2>
          <p>
            We use industry-standard measures to protect your information, including encrypted connections and
            access controls on sensitive data like verification documents and payout details. No system is
            completely secure, and we can&apos;t guarantee absolute security.
          </p>

          <h2>8. International data transfers</h2>
          <p>
            Some of the providers we use — including Firebase/Google, Cloudflare, Bachs, and Resend — process data
            outside Nigeria. We take steps to make sure your information is protected wherever it&apos;s processed.
          </p>

          <h2>9. Changes to this policy</h2>
          <p>
            We may update this policy as the Service changes. If we make a material change, we&apos;ll update the
            effective date above and, where appropriate, notify you.
          </p>

          <h2>10. Contact us</h2>
          <p>
            Questions about this policy or your data? Email us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        </LegalProse>

        <p className="text-xs text-ink-3 mt-8">
          See also our <Link href="/legal/terms">Terms of Service</Link>.
        </p>
      </div>
    </div>
  );
}
