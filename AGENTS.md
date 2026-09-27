<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Library R2 keys

Library objects live in serial folders: `library/<NNN>-<slug>/v1.1-member-<slug>.pdf`, `v1.1-teaser-<slug>.pdf`, `v1.1-<slug>.xlsx` (filename slug = folder slug). Serials come from `src/lib/library-serials.ts` (map: `docs/library-r2-key-map.json`); build keys with `fullObjectKey` / `teaserObjectKey` / `xlsxObjectKey` in `src/lib/library-catalog.ts`, never by hand. Slugs in routes, Neon and landing stay bare (`visa-pathways`). See README “Library storage”.
