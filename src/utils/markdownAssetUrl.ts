/**
 * Pure string helper, deliberately kept out of `markdownContent.ts` (which
 * imports `fs`) so it can be safely imported from client components too —
 * `HTMLContent` needs it to rewrite inline Markdown image paths, and bundling
 * a Node-only module into client code breaks the build.
 *
 * Markdown content (both local and GitHub-sourced) references images as
 * site-root-relative paths like `/assets/images/foo.png` — a holdover from
 * how the Astro spike serves them, base-path-free (see cms_spike's ADR on the
 * subject). Neither gateway-web's static files nor GitHub serve that path
 * directly, so it's rewritten to the `markdown-assets` route, which resolves
 * it against whichever content source (local disk or GitHub) is active.
 */
const ASSET_ROUTE_PREFIX = "/api/markdown-assets";

const toPublicAssetUrl = (assetPath: string): string => {
    const match = assetPath?.match(/^\/?assets\/(.+)$/);

    return match ? `${ASSET_ROUTE_PREFIX}/${match[1]}` : assetPath;
};

export { ASSET_ROUTE_PREFIX, toPublicAssetUrl };
