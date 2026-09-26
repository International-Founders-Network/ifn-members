# IFN Members

Thin member app for [International Founders Network](https://ifn.community) at **members.ifn.community**.

- **Auth:** Clerk (email+password + Google)
- **Entitlement:** Neon `memberships` (Stripe webhooks on the landing site). Auth ≠ paid.
- **Host:** Netlify (`ifn-members` → custom domain `members.ifn.community`)
- **Checkout:** stays on `https://ifn.community/membership` (Stripe on landing)

## Screens

| Route | Purpose |
| --- | --- |
| `/sign-in`, `/sign-up` | Clerk |
| `/` | Plan status, Library CTA, or Become a member |
| `/library` | Pack A list; Download PDF only when entitled **and** Admin enabled download for that file |
| `/account` | Email, plan, Stripe Customer Portal, Sign out |
| `/admin/members` | Full Neon roster — Clerk `publicMetadata.role === "admin"` only |
| `/admin/library` | Per-PDF `downloadable` toggle (Neon `library_assets`) — same admin role |

Landing Google `/admin` is unchanged and does **not** show this roster or Library toggles.

## Admin role

In Clerk Dashboard → Users → select user → Public metadata:

```json
{ "role": "admin" }
```

Only that gates View Members in this app.

## Entitlement (locked)

Match verified Clerk primary email → `lower(memberships.email)`.

- Entitled: `active`, `trialing`
- Also entitled: `past_due` if `last_event_at` within last **7 days** (grace). After grace: Library soft-lock + Stripe portal CTA (no hard error wall).
- Cancel-at-period-end: still entitled while Stripe status remains `active`.
- No row / mismatch: soft CTA + `hello@ifn.community`

## Local run

```bash
cp .env.example .env.local
# Paste Clerk, Neon, Stripe, optional R2 keys (never commit .env.local)

npm install
npm run dev
```

```bash
npm test          # entitlement unit tests
npm run build     # production build
```

Clerk was bootstrapped with `npx skills add clerk/skills` and `npx clerk@latest init` (accountless dev keys in local `.env.local` only). For production, create Clerk app **IFN Members** and paste real keys into Netlify env (see checklist below). Claim/replace accountless keys via `clerk auth login` when ready.

## Deploy (Netlify)

- Site name: `ifn-members`
- Default hostname: **`ifn-members.netlify.app`**
- Project / site id: `1a07ab6b-abbf-4a3b-939f-b50f0fdf9e5a`
- Admin: https://app.netlify.com/projects/ifn-members
- Build: `@netlify/plugin-nextjs` via `netlify.toml`

### DNS (Venkat)

Create CNAME:

| Host | Target |
| --- | --- |
| `members` (→ `members.ifn.community`) | `ifn-members.netlify.app` |

Then in Netlify: Domain management → Add domain `members.ifn.community`. In Clerk production, set allowed origins / sign-in URLs to `https://members.ifn.community`.

### Env on Netlify

Paste names from `/workspace/ifn-copy/2026-09-25-ifn-members-env-checklist.md` (or repo `.env.example`). **Never** put real `pk_` / `sk_` / `DATABASE_URL` values in git.

## Pack A storage

Object keys (private R2/S3):

- `pack-a/visa-pathways.pdf`
- `pack-a/entity-selection.pdf`
- `pack-a/austin-ecosystem-map.pdf`

### Download gate (Admin)

Neon table `library_assets` stores per-slug `downloadable` (default **false** / missing row = off). Admin toggles at `/admin/library`. Toggle save does **not** require the PDF on R2.

Member Library shows a disabled “Download unavailable” state when the flag is off. `/api/library/[slug]/download` returns **403** `{ reason: "download_disabled" }` if hit anyway (after entitlement checks).

Without R2 env, the same route returns **503** with a clear config reason after entitlement **and** downloadable pass.

## Stack notes

- Next.js App Router + TypeScript + Tailwind
- `src/proxy.ts` = Clerk `clerkMiddleware` (Next.js 16 Proxy convention)
- Shared Neon: `memberships` (landing webhooks) + members-owned `library_assets` (download gates; `CREATE TABLE IF NOT EXISTS` on first use; see `db/migrations/01_library_assets.sql`)
