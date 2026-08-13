import { NextRequest, NextResponse } from "next/server";
import { loadAsset } from "@/utils/markdownContent";

/**
 * Serves images referenced by Markdown content — see `markdownAssetUrl.ts`
 * for why the rewrite happens at all. Resolves against whichever content
 * source is active (local `cms_spike/assets`, or the same GitHub repo as the
 * Markdown itself), so the two content sources move together automatically.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path: segments } = await params;
    const asset = await loadAsset(segments.join("/"));

    if (!asset) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(asset.data), {
        headers: {
            "Content-Type": asset.contentType,
            "Cache-Control": "public, max-age=3600",
        },
    });
}
