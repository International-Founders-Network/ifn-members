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
| `/admin/library` | Resources-style cards for **every asset on R2** (auto-discovered + seeded) with **Approve public**, **Public teaser**, **Member download**, **Landing full download** switches, full/teaser PDF previews, multi-select and a sticky **bulk action bar** (Neon `library_assets`) — same admin role. Only Library SoT |
| `/api/public/library` | Public JSON catalog (copy + flags + object keys, no auth, no secrets) for landing |
| `/api/public/library/[slug]/teaser`, `/full` | Public landing downloads (302 to signed URL) while the matching flag is on |
| `PATCH /api/admin/library/flags/bulk` | Admin bulk flag save for up to 100 slugs |

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
npm test          # entitlement + library flag/catalog/discovery/bulk unit tests (R2 + Neon mocked)
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

## Library storage (R2 serial folders)

Content uploads to private R2 at any time; this app only lists and serves. Every asset has one **serial folder**, and the document version is in the filename:

```
library/<NNN>-<slug>/v1.1-member-<slug>.pdf   full member PDF
library/<NNN>-<slug>/v1.1-teaser-<slug>.pdf   public teaser PDF
library/<NNN>-<slug>/v1.1-<slug>.xlsx         workbook (no teaser twin)
```

- `NNN` is zero-padded to 3 digits and shared by the member PDF, teaser and workbook of one asset. Pack A is `001` visa-pathways, `002` entity-selection, `003` austin-ecosystem-map; `004`–`108` are the remaining seed ids sorted A→Z (108 assets: 93 PDF, 15 workbook-only).
- The registry lives in `src/lib/library-serials.ts` (`LIBRARY_SERIALS`, `serialForSlug`, `LIBRARY_DOC_VERSION = "v1.1"`); the full old → new key map is [`docs/library-r2-key-map.json`](docs/library-r2-key-map.json). New assets take the next free serial (`109`, …) and should be added to both.
- Key builders (`src/lib/library-catalog.ts`): `fullObjectKey(slug)`, `teaserObjectKey(slug)`, `xlsxObjectKey(slug)` derive keys from the registry serial (or an `nnn` passed from discovery for slugs outside it) and return `null` when neither knows the folder. E.g. `fullObjectKey("visa-pathways")` → `library/001-visa-pathways/v1.1-member-visa-pathways.pdf`, `xlsxObjectKey("biz-plan-builder")` → `library/008-biz-plan-builder/v1.1-biz-plan-builder.xlsx`.
- The filename repeats the folder slug; discovery ignores bare basenames (`v1.1-member.pdf`) and filenames whose slug differs from the folder. Signed URLs set `Content-Disposition: attachment; filename="<basename>"`, so downloads save as e.g. `v1.1-member-visa-pathways.pdf`.
- **Workbook-only assets** (`kind: "xlsx"`): the member deliverable (`objectKey`, used by member download and landing full) is the `.xlsx`; there is no teaser.
- **Slug identity** stays the bare slug (`visa-pathways`) for API routes, Neon rows and landing `id`s — never `001-visa-pathways`.
- The legacy flat keys (`pack-a/<slug>.pdf`, `pack-a/teasers/…`, `library/<slug>.pdf`, `library/teasers/…`) are ignored and are deleted outside this app after cutover.

### Discovery (catalog grows with R2)

The catalog is the union of these sources; an uploaded object is never dropped from Admin:

1. **R2 discovery** (`src/lib/library-discover.ts`): one paginated `ListObjectsV2` on prefix `library/` (`listLibraryObjectKeys` in `src/lib/storage.ts`). Keys are classified by:
   - `^library/(\d{3})-([^/]+)/v1\.1-member\.pdf$` → full
   - `^library/(\d{3})-([^/]+)/v1\.1-teaser\.pdf$` → teaser
   - `^library/(\d{3})-([^/]+)/v1\.1\.xlsx$` → xlsx

   Presence is `{ full, teaser, xlsx, nnn }` per slug; teaser- or workbook-only uploads still appear. Ignored: legacy flat keys, other versions, uppercase extensions, deeper folders, and slugs that are not safe (letters, digits, `-`, `_`). For a registry slug, only its registry folder counts (a stray `library/005-visa-pathways/…` is ignored).
2. **Serial registry** (`LIBRARY_SERIALS`): Admin lists all 108 even before (or without) an R2 listing.
3. **Known Pack A** (`PACK_A` in `src/lib/library-catalog.ts`): title/description/tag overrides. Other slugs get a readable title from the slug (`austin-ecosystem-map` → “Austin ecosystem map”), tag `PDF` (or `Workbook`) and a short placeholder description.
4. **Neon rows** in `library_assets`.

Order: Pack A first, then the rest alphabetically.

**Seeding:** every `/admin/library` load runs discovery and then `ensureLibraryAssetsSeeded(slugs)` for every registry serial and discovered slug: `INSERT … ON CONFLICT (slug) DO NOTHING` with all flags **FALSE** and `updated_by` NULL (card shows “Discovered …”). Existing flags are never overwritten. New uploads are therefore listed, all off, the next time an admin opens the page, and their switches save immediately.

**Known slug** (for flag saves, previews and downloads) = Pack A, a registry serial, or has a Neon row. Registry slugs build their keys directly; a Neon-only slug lists R2 once to learn its serial folder (no folder ⇒ 403 `object_missing`). Member Library and `/api/public/library` also run discovery but never write (no seeding on public or member traffic). Admin cards show `No full PDF on R2` / `No teaser on R2` (PDF assets), `No workbook on R2` (workbook assets) and `Workbook on R2` (PDF with a workbook) pills from the listing.

**Fail soft:** no R2 env or a listing error ⇒ catalog is Pack A + registry + Neon rows (Admin still lists them; pills hidden). No DB ⇒ flags off everywhere.

### Asset flags (Admin)

Neon table `library_assets` stores three independent per-slug flags, all default **false** (missing row = all off). Off always wins for that surface.

| Admin control | Column | API field | Surface |
| --- | --- | --- | --- |
| **Member download** | `downloadable` | `downloadable` | Entitled members download the full PDF on members.ifn.community |
| **Public teaser** | `teaser_public` | `teaserPublic` | Landing may offer the teaser only; never unlocks a full PDF |
| **Landing full download** | `landing_full` | `landingFull` | Landing may offer the full PDF to anyone, no sign-in |

**Approve public** is the primary Admin action. It sends `{ "approvePublic": true }`, which turns **Public teaser ON** automatically. The teaser can still be switched off afterward. It does not touch Member download or Landing full download.

**Deny public** sends `{ "denyPublic": true }`, which turns **Public teaser OFF and Landing full download OFF** (clears both public surfaces). Member download is untouched.

`PATCH /api/admin/library/[slug]/flags` accepts `{ downloadable?, teaserPublic?, landingFull?, approvePublic?, denyPublic? }` (booleans; at least one flag must result). Omitted flags keep their stored value (COALESCE upsert), so saving one flag never wipes the others. Contradictions are rejected (400): `approvePublic` + `teaserPublic: false`, `denyPublic` + `teaserPublic: true` or `landingFull: true`, `approvePublic` + `denyPublic`. `approvePublic: false` / `denyPublic: false` are no-ops. Unknown slug (not Pack A, not in the registry, no Neon row) ⇒ 404. The response always returns all three flags:

```json
{ "slug": "visa-pathways", "downloadable": false, "teaserPublic": true, "landingFull": false, "updated_at": "...", "updated_by": "..." }
```

Saving a flag does **not** require the PDF on R2.

Admin `/admin/library` lists every discovered/known asset (even with no Neon row) as Resources-style cards with search (title/slug/description) and status chips (All / Member download on / Public teaser on / Landing full on / All off).

### Bulk controls (Admin)

Each card has a select checkbox (selected cards get an ink ring). **Select all filtered** adds every card matching the current search + status chip; **Clear selection** empties it. While anything is selected, a sticky bar at the bottom shows the count (and how many are hidden by the current filter) with:

| Button | Patch sent |
| --- | --- |
| **Approve public** | `{ "approvePublic": true }` ⇒ Public teaser ON |
| **Deny public** | `{ "denyPublic": true }` ⇒ Public teaser OFF + Landing full OFF |
| Member download **On / Off** | `{ "downloadable": true \| false }` |
| Public teaser **On / Off** | `{ "teaserPublic": true \| false }` |
| Landing full **On / Off** | `{ "landingFull": true \| false }` |

Every bulk action asks for confirmation. Per-card switches are unchanged.

`PATCH /api/admin/library/flags/bulk` (Clerk admin only; 401/403 otherwise):

```json
{ "slugs": ["visa-pathways", "cap-table-basics"], "patch": { "approvePublic": true } }
```

- `slugs`: 1–100 (de-duplicated), each a safe slug; `patch`: same rules as the single-slug PATCH.
- One statement (`INSERT … SELECT unnest(slugs) … ON CONFLICT DO UPDATE` with COALESCE), so omitted flags keep their per-slug values.
- All-or-nothing: any unknown slug ⇒ 404 `{ "error": "Unknown library items", "unknownSlugs": [...] }` and nothing is written.
- Success ⇒ `{ "updated": [{ "slug", "downloadable", "teaserPublic", "landingFull", "updated_at", "updated_by" }, ...] }`.
- The Admin UI sends selections over 100 in sequential chunks of 100 and stops at the first failed chunk.

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
      "fullObjectKey": "library/001-visa-pathways/v1.1-member-visa-pathways.pdf",
      "teaserObjectKey": "library/001-visa-pathways/v1.1-teaser-visa-pathways.pdf",
      "xlsxObjectKey": null
    }
  ]
}
```

`assets` = Pack A ∪ R2 discovery ∪ Neon rows (see Discovery); registry serials appear once Admin has seeded them. Object keys are informational and may be `null` (no teaser for workbooks; no serial folder known yet); workbook-only assets report the `.xlsx` as `fullObjectKey`. Pack A `id`s match landing `resourcesData.ts` (`visa-pathways`, `entity-selection`, `austin-ecosystem-map`); discovered assets use their slug, the derived title and the placeholder description, all flags off until Admin turns them on.

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
