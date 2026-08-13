import { NextResponse } from "next/server";
import { getContentRoot, isRemoteRoot } from "@/utils/markdownContent";

/**
 * Answers, from the live server process rather than by inference from logs
 * or env files, which Markdown content source is actually active — set via
 * `MARKDOWN_CONTENT_ROOT` (see markdownContent.ts). Safe to expose: neither
 * value contains `MARKDOWN_CONTENT_GITHUB_TOKEN`, which is only ever sent as
 * a request header, never embedded in the root URL itself.
 *
 * `getContentRoot()`/`isRemoteRoot()` throw if `MARKDOWN_CONTENT_ROOT` isn't
 * set — deliberately, since that's only a real problem once
 * `MarkdownContentSource` is on (see markdownContent.ts) — so unlike every
 * other consumer, this route calls them unconditionally just to check
 * configuration, and reports "not configured" as a normal, expected answer
 * rather than letting it 500.
 *
 * Debug aid for this spike, not a route meant to ship as-is: an unauthenticated
 * endpoint that echoes server-side config, however harmless here, isn't a
 * pattern to carry into production without at least gating it out of prod
 * builds.
 */
export async function GET() {
    try {
        return NextResponse.json({
            configured: true,
            source: isRemoteRoot() ? "github" : "local",
            contentRoot: getContentRoot(),
        });
    } catch {
        return NextResponse.json({
            configured: false,
            source: null,
            contentRoot: null,
        });
    }
}
