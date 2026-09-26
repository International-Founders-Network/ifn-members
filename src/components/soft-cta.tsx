import Link from "next/link";

const MEMBERSHIP_URL = "https://ifn.community/membership";

type SoftCtaProps = {
  title: string;
  body: string;
  /** Show Become a member CTA */
  showMembership?: boolean;
  /** Show portal form action */
  showPortal?: boolean;
  contact?: boolean;
};

export function SoftCta({
  title,
  body,
  showMembership = true,
  showPortal = false,
  contact = true,
}: SoftCtaProps) {
  return (
    <div className="rounded-xl border border-[var(--ink-muted)]/20 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-[var(--ink)]">{title}</h2>
      <p className="mt-2 text-[var(--ink-muted)] leading-relaxed">{body}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {showMembership ? (
          <a
            href={MEMBERSHIP_URL}
            className="inline-flex rounded-full bg-[var(--crimson)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Become a member
          </a>
        ) : null}
        {showPortal ? (
          <form action="/api/stripe/portal" method="POST">
            <button
              type="submit"
              className="inline-flex rounded-full border border-[var(--ink)]/20 px-4 py-2 text-sm font-medium text-[var(--ink)] hover:border-[var(--crimson)] hover:text-[var(--crimson)]"
            >
              Manage billing
            </button>
          </form>
        ) : null}
        {contact ? (
          <a
            href="mailto:hello@ifn.community"
            className="inline-flex rounded-full border border-[var(--ink)]/20 px-4 py-2 text-sm font-medium text-[var(--ink)] hover:border-[var(--crimson)]"
          >
            Contact hello@ifn.community
          </a>
        ) : null}
        <Link
          href="/"
          className="inline-flex px-2 py-2 text-sm text-[var(--ink-muted)] hover:text-[var(--crimson)]"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
