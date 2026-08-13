# SPIKE.md — Markdown content source for gateway-web

Summary of the spike enacting `SPEC.md`: replacing WordPress+GraphQL as the source of static/CMS content in `gateway-web` with Markdown. For full technical detail, field-mapping tables, and the real bugs caught along the way, see `CONVERSION_PLAN.md` — this document is the quick-orientation version.

## Running this locally

```bash
$ git clone https://github.com/andy-yates-hdr/gateway-web
$ git clone https://github.com/HDRUK/techspike-wordpress-replacement
$ cd gateway-web && git checkout spike/markdown
$ cp .env.local.example .env.local
# Edit src/flags.ts as detailed below
# Edit .env.local to the checkout location for techspike-wordpress-replacement
$ npm run dev
```

Note you will need to add the `export const isMarkdownContentEnabled = async () => true;` line (see below) to run without an instance of gateway-api. Or you can set `MARKDOWN_CONTENT_ROOT` ENV to GitHub (https://api.github.com/repos/HDRUK/techspike-wordpress-replacement/contents/content?ref=main) and add a PAT scoped to read for that repo.

## What changed

- **Feature flag**: `MarkdownContentSource` (Laravel Pennant on `gateway-api`, `@vercel/flags` on `gateway-web` — `src/flags.ts` → `isMarkdownContentEnabled`). Off by default; every change below is inert until it's on.
- **Content source** (`src/utils/markdownContent.ts`): reads Markdown from either a local filesystem path or the GitHub Contents API, chosen by `MARKDOWN_CONTENT_ROOT` (a URL → remote; anything else → local). No default — required, but only once the flag actually resolves `true` (validated lazily, not at import time).
- **Converted** (behind the flag): `getContentPageQuery`, `getContentPageByParentQuery`, `getContentPostQuery`, `getNews`, `getEvents`, `getReleaseNotes`, `getMissionAndPurposes`, and every thin wrapper page that calls them — the large majority of static pages, news, events, releases.
- **Partial fallback**: `getHomePage` — real news/events, but the ACF-only sections (hero video, affiliate link, funder logos, meet-the-team) are left blank since no Markdown equivalent exists.
- **Left on WordPress, unconverted**: `getHomePageBanner`, `getMeetTheTeam`, `getContributorsAndCollaborators`, `getCohortDiscovery`, `getNewCohortDiscovery`, `getCohortDiscoverySupportPageQuery`, `getCohortTermsAndConditions` — all ACF-structured content with no crawled source data.
- **Rendering** (`src/components/HTMLContent/HTMLContent.tsx`): branches on the same flag — Markdown renders via `markdown-to-jsx`; WordPress HTML keeps its existing `DOMPurify` + `dangerouslySetInnerHTML` path.
- **Images**: `/api/markdown-assets/[...path]` proxies image bytes from whichever content source is active; `src/utils/markdownAssetUrl.ts` rewrites `/assets/...` paths to that route. Works for both local and GitHub mode.
- **Rich Markdown** (`src/components/HTMLContent/MarkdownMedia.tsx`), ported from the earlier Astro spike:
  - A captioned image (`![alt](src "caption")`) renders as `<figure>`/`<figcaption>`.
  - A lone YouTube link renders as a click-to-load video facade (nothing requested from YouTube until pressed).
  - Images center by default; an author can override via `<img class="alignleft|alignright|aligncenter">` written as raw HTML in the Markdown body (plain CommonMark, no custom syntax).
- **Caching** (GitHub mode only): in-memory, per the two env vars below. Not applied to local mode (`fs` reads are already instant).
- **Debug endpoint**: `GET /api/markdown-content-status` — reports which source is actually live (`{ configured, source, contentRoot }`). Spike-only; not meant to ship as-is (see Gaps).

### New env vars

| Var | Required? | Purpose |
|---|---|---|
| `MARKDOWN_CONTENT_ROOT` | Yes, once the flag is on | Local path or GitHub Contents API URL |
| `MARKDOWN_CONTENT_GITHUB_TOKEN` | Only if the repo is private | Sent as `Authorization: Bearer` |
| `MARKDOWN_CONTENT_CACHE_TTL_SECONDS` | No — defaults to 300 | GitHub mode only; `0` disables caching |
| `MARKDOWN_CONTENT_ETAG_CHECK` | No — defaults off | `true` to revalidate via `If-None-Match` instead of unconditional re-fetch once the TTL lapses |

## Running this without a `gateway-api` instance

The flag is real (Pennant-backed), so resolving it normally needs `gateway-api` reachable. `gatewayFlagAdapter.ts` already handles it not being there gracefully — a failed fetch resolves every flag to `false`, so **with no `gateway-api` running, `gateway-web` behaves exactly as it did before this spike**: WordPress path, flag off. Any 500s you see in that state come from `NEXT_PUBLIC_WORDPRESS_API_URL` being unset, not from anything in this spike.

To actually exercise the Markdown path without standing up `gateway-api`:

1. In `src/flags.ts`, temporarily replace the `isMarkdownContentEnabled` export:
   ```ts
   export const isMarkdownContentEnabled = async () => true;
   ```
   (Revert before committing — this is a local override, not a real toggle.)
2. Set `MARKDOWN_CONTENT_ROOT` in `.env.local` — either the sibling `cms_spike/content` checkout, or a GitHub Contents API URL (+ token if private).
3. `npm run dev` (or `npm run build && npm run start`).

The Markdown path itself never calls `gateway-api` for content — only the flag resolution does, and that's what step 1 bypasses.

To exercise it the "real" way instead: run `gateway-api` locally and activate the flag — `Feature::activate('MarkdownContentSource')` via `php artisan tinker`, or the admin `FeatureFlagsTable` UI.

## Gaps before this could move towards production

- **Homepage ACF content has no source.** Hero video, affiliate link, funder logos, and the meet-the-team callout are hardcoded blank in the Markdown fallback. Needs either a real content model for these, or the homepage stays partially WordPress-dependent.
- **Six functions are entirely unconverted** (listed above) — Cohort Discovery pages, Meet the Team, Contributors & Collaborators, the homepage banner. All ACF-structured; converting them means designing a Markdown-representable shape for that content first, which didn't exist in the crawled data this spike had to work with.
- **Two known slug mismatches**: `getGettingStarted` and `getMetadataOnboarding` request WordPress ids that don't correspond to any crawled filename or title — they resolve to `null` (a clean 404) rather than crashing, but the pages themselves are unreachable via Markdown.
- **Cache is in-memory, per-process.** Fine for a single spike instance; wrong for real infrastructure — resets on every deploy/restart, isn't shared across replicas/pods, and gives no cross-instance consistency. Would need a shared cache (Redis, or reworking onto Next's own `fetch`/data cache) before this sees real traffic.
- **No cache invalidation on content change** beyond TTL expiry/ETag checks. A GitHub webhook that purges the cache on push would close the gap between "content edited" and "content live" without waiting out the TTL.
- **`MARKDOWN_CONTENT_GITHUB_TOKEN` is a static PAT.** Production should use a GitHub App or fine-grained deploy key scoped read-only to this one repo, with rotation — not a personal access token sitting in an env var indefinitely.
- **`/api/markdown-content-status` is unauthenticated** and echoes server config. Harmless here, but gate it out of production builds (or behind auth) before this goes further — it's explicitly a debug aid, not a supported API.
- **No image optimization.** `/api/markdown-assets` serves bytes as-is; there's no resizing/format-negotiation equivalent to `next/image` or whatever pipeline WordPress's media library provided.
- **GitHub API rate limits** (5,000/hr authenticated) are comfortable at spike traffic but untested at production scale — caching tuned for that would need real traffic numbers, and a backoff/alerting strategy for when limits are approached.
- **Test coverage is unit-level only** (`markdownContent.test.ts`, `MarkdownMedia.test.tsx`, `cms.homepage.test.ts`, etc.) plus manual live verification against the real repo. No Cypress/e2e coverage was added for the Markdown-enabled path.
- **Only validated against the specific content shape `cms_spike` crawled.** Hand-authored edits, new content types, or a restructured directory layout haven't been exercised — the recursive-basename and slugified-title fallbacks in `loadPage` cover the mismatches found so far, not necessarily every future one.
