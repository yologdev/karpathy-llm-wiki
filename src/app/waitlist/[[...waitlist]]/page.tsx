import type { Metadata } from "next";
import { Waitlist } from "@clerk/nextjs";

export const metadata: Metadata = {
  // The layout title template appends " · yopedia".
  title: "Join the waitlist",
};

/**
 * `/waitlist` — the public landing for new visitors while yopedia is invite-only.
 *
 * Registration is gated in Clerk (waitlist sign-up mode, set in the Clerk
 * dashboard), so a brand-new visitor can't create an account directly: they
 * leave an email here, then get approved out-of-band in Clerk (the dashboard's
 * waitlist, which emails an invite to finish sign-up). Reading the commons stays
 * fully public — this only gates *joining*.
 *
 * The optional catch-all segment (`[[...waitlist]]`) lets Clerk's `<Waitlist />`
 * own any sub-routes of its flow without a 404 (per Clerk's Next.js setup).
 */
export default function WaitlistPage() {
  return (
    <div className="fade">
      <section
        className="shell"
        style={{ paddingTop: 96, paddingBottom: 96, textAlign: "center" }}
      >
        <p className="fmark" style={{ justifyContent: "center" }}>
          invite only
        </p>
        <h1
          className="display"
          style={{ fontSize: "clamp(34px,4.6vw,58px)", margin: "16px 0 12px" }}
        >
          Join the waitlist
        </h1>
        <p
          style={{
            color: "var(--ink-2)",
            fontSize: 18,
            maxWidth: "46ch",
            margin: "0 auto 32px",
            lineHeight: 1.55,
          }}
        >
          yopedia is invite-only for now. Leave your email and we&rsquo;ll let
          you in as we open up. Browsing the commons stays open to everyone.
        </p>
        <div className="flex justify-center">
          <Waitlist />
        </div>
      </section>
    </div>
  );
}
