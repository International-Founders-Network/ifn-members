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
| `/library` | Pack A as a searchable, filterable Resources-style card grid; Download PDF only when entitled **and** Admin turned on **Member download** for that file |
| `/account` | Email, plan, Stripe Customer Portal, Sign out |
| `/admin/members` | Full Neon roster — Clerk `publicMetadata.role === "admin"` only |
| `/admin/library` | Resources-style cards with **Approve public**, **Public teaser**, **Member download**, **Landing full download** switches and full/teaser PDF previews (Neon `library_assets`) — same admin role. Only Library SoT |
| `/api/public/library` | Public JSON catalog (copy + flags + object keys, no auth, no secrets) for landing |
| `/api/public/library/[slug]/teaser`, `/full` | Public landing downloads (302 to signed URL) while the matching flag is on |

Landing Google `/admin` is unchanged and does **not** show this roster or Library toggles. Members `/admin/library` is the single source of truth for Pack A flags.

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
npm test          # entitlement + library flag/catalog unit tests
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

Teaser objects: `pack-a/teasers/<slug>.pdf` (Content uploads them; this app only serves them).

### Asset flags (Admin)

Neon table `library_assets` stores three independent per-slug flags, all default **false** (missing row = all off). Off always wins for that surface.

| Admin control | Column | API field | Surface |
| --- | --- | --- | --- |
| **Member download** | `downloadable` | `downloadable` | Entitled members download the full PDF on members.ifn.community |
| **Public teaser** | `teaser_public` | `teaserPublic` | Landing may offer the teaser only; never unlocks a full PDF |
| **Landing full download** | `landing_full` | `landingFull` | Landing may offer the full PDF to anyone, no sign-in |

**Approve public** is the primary Admin action. It sends `{ "approvePublic": true }`, which turns **Public teaser ON** automatically. The teaser can still be switched off afterward. It does not touch Member download or Landing full download.

`PATCH /api/admin/library/[slug]/flags` accepts `{ downloadable?, teaserPublic?, landingFull?, approvePublic? }` (booleans; at least one flag must result). Omitted flags keep their stored value (COALESCE upsert), so saving one flag never wipes the others. `approvePublic: true` + `teaserPublic: false` is rejected as contradictory (400); `approvePublic: false` is a no-op. The response always returns all three flags:

```json
{ "slug": "visa-pathways", "downloadable": false, "teaserPublic": true, "landingFull": false, "updated_at": "...", "updated_by": "..." }
```

Saving a flag does **not** require the PDF on R2.

Admin `/admin/library` lists every Pack A entry (even with no Neon row) as Resources-style cards with search (title/slug/description) and status chips (All / Member download on / Public teaser on / Landing full on / All off).

### Admin preview (review in place)

Each Admin card has **Preview full PDF** and **Preview teaser PDF** (new tab):

`GET /api/admin/library/[slug]/preview?kind=full|teaser`

- Clerk admin only (401 signed out, 403 non-admin). Ignores all three flags: admins can always preview.
- HeadObject first; missing object ⇒ **403** `{ "error": "Object not found in R2: <key>", "reason": "object_missing" }`.
- Success ⇒ **302** to a 5-minute signed R2 URL (`Cache-Control: no-store`). No R2 env ⇒ 503 `storage_not_configured`.

### Member download

Member Library shows a disabled “Download unavailable” state when Member download is off. `/api/library/[slug]/download` (unchanged) returns **403** `{ reason: "download_disabled" }` if hit anyway (after entitlement checks). Without R2 env, the same route returns **503** with a clear config reason after entitlement **and** Member download pass.

### Public catalog

`GET /api/public/library` — no auth, copy + flags + object keys only (no signed URLs, no secrets). CORS allows `https://ifn.community`, `https://www.ifn.community`, and `http://localhost:*`; `Cache-Control: public, max-age=60, s-maxage=60`.

```json
{
  "assets": [
    {
      "id": "visa-pathways",
      "title": "Visa pathways",
      "description": "A practical map of founder-relevant visa options and how they fit together.",
      "memberDownloadable": false,
      "teaserPublic": false,
      "landingFull": false,
      "fullObjectKey": "pack-a/visa-pathways.pdf",
      "teaserObjectKey": "pack-a/teasers/visa-pathways.pdf"
    }
  ]
}
```

`id` matches landing `resourcesData.ts` ids (`visa-pathways`, `entity-selection`, `austin-ecosystem-map`).

### Public downloads (landing)

No auth, same CORS helper as the catalog (plus `OPTIONS`), `Cache-Control: no-store`. Link to them directly (`<a href>`); they redirect to a 5-minute signed R2 URL.

| Route | Requires | Off ⇒ |
| --- | --- | --- |
| `GET /api/public/library/[slug]/teaser` | `teaser_public` | 403 `{ "reason": "teaser_disabled" }` |
| `GET /api/public/library/[slug]/full` | `landing_full` | 403 `{ "reason": "landing_full_disabled" }` |

Unknown slug ⇒ 404 `unknown_slug`. Flag lookup failure ⇒ treated as off. Object missing on R2 ⇒ 403 `object_missing` (message names the key). No R2 env ⇒ 503.

## Stack notes

- Next.js App Router + TypeScript + Tailwind
- `src/proxy.ts` = Clerk `clerkMiddleware` (Next.js 16 Proxy convention)
- Shared Neon: `memberships` (landing webhooks) + members-owned `library_assets` (member-on, teaser-on and landing-full flags; `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS` on first use; see `db/migrations/01_library_assets.sql`, `02_library_assets_teaser_public.sql`, `03_library_assets_landing_full.sql`)
- Library UI reuses the landing `Resources.tsx` pattern (`src/components/library/resource-ui.tsx`): search, `aria-pressed` chips, icon-box cards, no-match state. Icons from `lucide-react`
