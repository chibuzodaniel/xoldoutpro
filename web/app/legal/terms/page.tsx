import type { Metadata } from "next";
import Link from "next/link";
import { BackHeader } from "@/components/ui/BackHeader";
import { LegalProse } from "@/components/legal/LegalProse";

export const metadata: Metadata = {
  title: "Terms of Service — XOLDOUT",
};

// Draft content covering XOLDOUT's actual policies as built this session
// (12% commission, ₦1,000 minimum withdrawal, sold-out-stays-sold-out caps,
// 45-day account recovery, copyright takedown + refund path, Bachs as
// payment/payout processor). Starting point, not legal advice — have a
// lawyer review before treating it as final, and fill in a real
// support-inbox address below if support@xoldout.app isn't it.
const EFFECTIVE_DATE = "September 1, 2026";
const SUPPORT_EMAIL = "support@xoldout.app";
const COMMISSION_PERCENT = 12;
const MIN_WITHDRAWAL_NAIRA = 1000;

export default function TermsOfServicePage() {
  return (
    <div className="pb-16">
      <BackHeader title="Terms of Service" />
      <div className="px-4 max-w-2xl mx-auto">
        <p className="text-[11px] uppercase tracking-widest text-ink-3 mb-6">Effective {EFFECTIVE_DATE}</p>

        <LegalProse>
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your use of the XOLDOUT app and website (the
            &quot;Service&quot;), operated by XOLDOUT (&quot;we,&quot; &quot;us&quot;). By creating an account or using
            the Service, you agree to these Terms.
          </p>

          <h2>1. Eligibility and accounts</h2>
          <p>
            You must be old enough, under the law that applies to you, to enter into a binding contract to use the
            Service, including to buy or sell anything on it. You&apos;re responsible for keeping your account secure
            and for everything that happens under it. One person or business may not maintain more than one active
            account for abusive purposes (e.g. evading a moderation decision).
          </p>

          <h2>2. Content you post</h2>
          <p>
            You keep ownership of the music, artwork, merchandise listings, posts, and everything else you upload.
            By posting it, you grant XOLDOUT a license to host, display, and distribute it as needed to operate the
            Service — for example, showing a track&apos;s preview to a potential buyer, or a post to your followers.
          </p>
          <p>You agree not to post content that:</p>
          <ul>
            <li>Infringes someone else&apos;s copyright, trademark, or other rights.</li>
            <li>Is illegal, fraudulent, or misrepresents what a buyer will actually receive.</li>
            <li>Is harassing, hateful, or sexually exploitative, especially involving a minor.</li>
            <li>Violates any other law that applies to you or to XOLDOUT.</li>
          </ul>
          <p>
            We investigate reports of infringing or abusive content and may remove it, take down the associated
            listing, or suspend the responsible account, as described in Section 7.
          </p>

          <h2>3. Buying on XOLDOUT</h2>
          <p>
            Prices are shown in Nigerian Naira and paid through our payment processor, Bachs. Once a purchase
            completes, you get a permanent entitlement to that release, beat, or ticket — purchases of digital goods
            are final, except where a listing is taken down for a valid copyright claim (Section 7), in which case
            you&apos;re refunded automatically. Physical merchandise is shipped by the seller directly; contact them
            (or XOLDOUT support, if unresponsive) about shipping issues.
          </p>
          <p>
            A limited-quantity listing that sells out stays sold out permanently — the seller may publish a new
            listing for a second pressing, but an old cap is never reopened.
          </p>

          <h2 id="beat-licenses">4. Beat licenses</h2>
          <p>
            A beat purchase grants a single, non-exclusive license to use that beat commercially — in recordings,
            performances, and monetized streaming — for as long as you own the entitlement. It does not transfer
            copyright in the beat itself: the producer keeps ownership and may continue selling the same beat to
            other buyers unless a listing explicitly says otherwise. You may not resell, redistribute, or re-license
            the beat file itself as a standalone product.
          </p>
          <p>
            <strong>Producer Agreement.</strong> Before publishing a beat, a producer must confirm they own it, or
            have the rights to license it, and that any samples used have been cleared for commercial use — XOLDOUT
            relies on this confirmation and does not independently verify it. By publishing, a producer authorizes
            XOLDOUT to list and promote the beat, collect payment on their behalf, deduct the platform commission,
            pay out the remainder, issue the license described above to buyers, and — if a valid copyright claim is
            upheld (Section 7) — remove the listing and refund affected buyers. A producer who publishes a beat they
            don&apos;t have the rights to is solely responsible for any resulting claim.
          </p>

          <h2>5. Selling on XOLDOUT</h2>
          <p>
            You&apos;re responsible for the accuracy of everything you list — pricing, availability, and, for
            physical merchandise, actually shipping what was ordered. XOLDOUT takes a <strong>{COMMISSION_PERCENT}%
            commission</strong> on each sale; the remainder is credited to your XOLDOUT wallet.
          </p>
          <p>
            You can withdraw your wallet balance to a linked bank account at any time, subject to a minimum
            withdrawal of <strong>₦{MIN_WITHDRAWAL_NAIRA.toLocaleString("en-NG")}</strong>. Payouts are processed
            through Bachs. If a sale you made is later reversed (for example, a copyright takedown), the
            corresponding amount is deducted from your wallet.
          </p>

          <h2>6. Verification badges</h2>
          <p>
            Verification badges (Identity, Seller, Creator, Official, Business, Fanbase) are optional and reviewed by
            XOLDOUT moderators. Approval isn&apos;t guaranteed, and a badge may be suspended or revoked if the
            information behind it turns out to be false or the account violates these Terms.
          </p>

          <h2>7. Reports, moderation, and enforcement</h2>
          <p>
            Anyone can report content or an account for violating these Terms. We review reports and may, at our
            discretion: dismiss the report, remove content, take down a listing and refund affected buyers (for
            copyright claims), or suspend or terminate the account responsible. We aim to act in good faith but
            don&apos;t guarantee any particular outcome or timeline.
          </p>

          <h2>8. Fanbase groups</h2>
          <p>
            Fanbase groups are private, request-to-join communities. Group creators are responsible for who they
            admit and what happens in their group, subject to these Terms and XOLDOUT&apos;s moderation.
          </p>

          <h2>9. Account deletion</h2>
          <p>
            You can delete your account at any time from Edit Profile. This signs you out of every device
            immediately. You have 45 days to recover it by signing back in; after that it becomes permanently
            disabled and can only be restored by a XOLDOUT moderator.
          </p>

          <h2>10. Termination</h2>
          <p>
            We may suspend or terminate your access to the Service if you violate these Terms, misuse the Service,
            or where required by law. You may stop using the Service, and delete your account, at any time.
          </p>

          <h2>11. Disclaimers and limitation of liability</h2>
          <p>
            The Service is provided &quot;as is.&quot; We don&apos;t guarantee it will be uninterrupted, error-free,
            or that any particular sale, payout, or verification outcome will occur. To the fullest extent permitted
            by law, XOLDOUT is not liable for indirect, incidental, or consequential damages arising from your use of
            the Service.
          </p>

          <h2>12. Changes to these Terms</h2>
          <p>
            We may update these Terms as the Service changes. If we make a material change, we&apos;ll update the
            effective date above and, where appropriate, notify you. Continuing to use the Service after a change
            means you accept the updated Terms.
          </p>

          <h2>13. Governing law</h2>
          <p>These Terms are governed by the laws of the Federal Republic of Nigeria.</p>

          <h2>14. Contact us</h2>
          <p>
            Questions about these Terms? Email us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        </LegalProse>

        <p className="text-xs text-ink-3 mt-8">
          See also our <Link href="/legal/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
