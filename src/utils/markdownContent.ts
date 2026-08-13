import fs from "fs";
import path from "path";

/**
 * Reads content either from the `cms_spike` spike checked out locally, or
 * from its GitHub source over HTTPS — per SPEC.md: "those markdown documents
 * will be hosted locally (see within `cms_spike`) but eventually might be
 * pulled down from GitHub". Which mode is active is decided entirely by
 * whether `MARKDOWN_CONTENT_ROOT` looks like a URL; everything above this
 * module (`cms.ts` and beyond) is unaware of the difference.
 *
 * In remote mode, `MARKDOWN_CONTENT_ROOT` is a GitHub Contents API URL
 * pointing at the content directory, e.g.
 * `https://api.github.com/repos/HDRUK/techspike-wordpress-replacement/contents/content?ref=main`.
 * That one endpoint shape does both directory listing (JSON) and raw file
 * fetching (via an `Accept` header), which a plain raw.githubusercontent.com
 * URL can't — this module needs both to support the recursive slug fallback
 * and collection loading.
 *
 * No default is assumed for local mode — an unset `MARKDOWN_CONTENT_ROOT`
 * used to fall back to a hardcoded sibling `cms_spike/content` path, which
 * meant a missing env var silently pointed at a specific machine's checkout
 * rather than failing. Rejected instead: better to fail loudly than serve
 * from a path nobody configured.
 *
 * That rejection is deliberately lazy — checked the first time
 * `getContentRoot()` actually runs, not at module import time. `cms.ts`
 * imports this module unconditionally, but only calls into it from inside
 * its `if (await isMarkdownContentEnabled())` branches — so an unset
 * `MARKDOWN_CONTENT_ROOT` only matters, and only fails, when
 * `MarkdownContentSource` is actually on. With the flag off (its default),
 * this module can sit completely unconfigured with no effect on anything.
 */
let cachedContentRoot: string | undefined;

const getContentRoot = (): string => {
    if (cachedContentRoot) return cachedContentRoot;

    const raw = process.env.MARKDOWN_CONTENT_ROOT;

    if (!raw) {
        throw new Error(
            "MARKDOWN_CONTENT_ROOT is not set. Set it to either a local filesystem " +
                "path to the content directory, or a GitHub Contents API URL " +
                "(e.g. https://api.github.com/repos/OWNER/REPO/contents/content?ref=main)."
        );
    }

    cachedContentRoot = raw;
    return cachedContentRoot;
};

const isRemoteRoot = (): boolean => /^https?:\/\//.test(getContentRoot());

// Never logged: only ever attached as a request header.
const GITHUB_TOKEN = process.env.MARKDOWN_CONTENT_GITHUB_TOKEN;

/**
 * Caching applies only to remote (GitHub) mode — local `fs` reads are
 * already effectively instant, so there's nothing to cache there.
 *
 * Two independent knobs, both env-configured:
 *   - `MARKDOWN_CONTENT_CACHE_TTL_SECONDS`: how long a fetched value is
 *     served without any network call at all. Defaults to 300s. Setting it
 *     to `0` disables caching outright (every read hits the network).
 *   - `MARKDOWN_CONTENT_ETAG_CHECK`: once the TTL has expired, whether to
 *     revalidate via a conditional request (`If-None-Match`) before
 *     deciding to re-fetch. GitHub's Contents API returns a `304` with no
 *     body when the ETag still matches — confirmed live against the real
 *     repo — so this avoids re-downloading and re-parsing unchanged content,
 *     at the cost of one extra round trip (still one HTTP request, same as
 *     a plain GET) whenever the TTL has lapsed. Off by default: with this
 *     off, an expired entry is simply re-fetched unconditionally.
 */
const CACHE_TTL_MS =
    Number(process.env.MARKDOWN_CONTENT_CACHE_TTL_SECONDS ?? 300) * 1000;
const ETAG_CHECK_ENABLED = process.env.MARKDOWN_CONTENT_ETAG_CHECK === "true";

interface CacheEntry<T> {
    value: T;
    etag: string | null;
    expiresAt: number;
}

const remoteCache = new Map<string, CacheEntry<unknown>>();

/**
 * Shared by every remote read (file, directory listing, asset) — same
 * TTL/ETag mechanics regardless of what's being fetched or how the response
 * body is parsed. On a network exception (not a clean HTTP error status),
 * falls back to a stale cached value if one exists, rather than treating a
 * transient outage the same as a genuine 404.
 */
const fetchWithCache = async <T>(
    url: string,
    accept: string,
    parse: (res: Response) => Promise<T>
): Promise<T | null> => {
    const now = Date.now();
    const cached = remoteCache.get(url) as CacheEntry<T> | undefined;

    if (cached && now < cached.expiresAt) {
        return cached.value;
    }

    try {
        const headers: Record<string, string> = {
            Accept: accept,
            ...(GITHUB_TOKEN && { Authorization: `Bearer ${GITHUB_TOKEN}` }),
            ...(ETAG_CHECK_ENABLED && cached?.etag
                ? { "If-None-Match": cached.etag }
                : {}),
        };

        const res = await fetch(url, { headers });

        if (res.status === 304 && cached) {
            cached.expiresAt = now + CACHE_TTL_MS;
            return cached.value;
        }

        if (!res.ok) return null;

        const value = await parse(res);

        remoteCache.set(url, {
            value,
            etag: res.headers.get("etag"),
            expiresAt: now + CACHE_TTL_MS,
        });

        return value;
    } catch {
        return cached ? cached.value : null;
    }
};

export interface ParsedMarkdown {
    data: Record<string, string | boolean>;
    body: string;
}

interface DirEntry {
    name: string;
    isDirectory: boolean;
}

/**
 * Hand-rolled in place of a YAML library: gateway-web has no direct
 * dependency on one (js-yaml is only transitive), and the frontmatter here is
 * flat key/value pairs only, so a full parser isn't needed.
 */
const parseFrontmatter = (raw: string): ParsedMarkdown => {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

    if (!match) {
        return { data: {}, body: raw };
    }

    const [, frontmatter, body] = match;
    const data: Record<string, string | boolean> = {};

    frontmatter.split(/\r?\n/).forEach(line => {
        const lineMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
        if (!lineMatch) return;

        const [, key, rawValue] = lineMatch;
        let value = rawValue.trim();

        if (
            (value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))
        ) {
            value = value.slice(1, -1);
        }

        if (value === "true" || value === "false") {
            data[key] = value === "true";
        } else {
            data[key] = value;
        }
    });

    return { data, body: body.trim() };
};

// --- local (fs) access -------------------------------------------------

const localReadFile = (relativePath: string): string | null => {
    try {
        return fs.readFileSync(
            path.join(getContentRoot(), relativePath),
            "utf-8"
        );
    } catch {
        return null;
    }
};

const localListDir = (relativePath: string): DirEntry[] => {
    const dir = path.join(getContentRoot(), relativePath);

    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return [];
    }

    return fs.readdirSync(dir).map(name => ({
        name,
        isDirectory: fs.statSync(path.join(dir, name)).isDirectory(),
    }));
};

// --- remote (GitHub Contents API) access --------------------------------

const remoteUrlFor = (relativePath: string): string => {
    const base = new URL(getContentRoot());
    const cleanPath = relativePath.replace(/^\/+|\/+$/g, "");

    return `${base.origin}${base.pathname}${cleanPath ? `/${cleanPath}` : ""}${base.search}`;
};

const remoteReadFile = (relativePath: string): Promise<string | null> =>
    fetchWithCache(
        remoteUrlFor(relativePath),
        "application/vnd.github.raw+json",
        res => res.text()
    );

interface GitHubContentsEntry {
    name: string;
    type: string;
}

const remoteListDir = async (relativePath: string): Promise<DirEntry[]> => {
    const json = await fetchWithCache(
        remoteUrlFor(relativePath),
        "application/vnd.github+json",
        res => res.json() as Promise<GitHubContentsEntry[] | unknown>
    );

    return Array.isArray(json)
        ? json.map(entry => ({
              name: entry.name,
              isDirectory: entry.type === "dir",
          }))
        : [];
};

// --- assets (images) ------------------------------------------------------

/**
 * Images live in a directory next to `content`, not inside it (in cms_spike:
 * `content/` and `assets/` are siblings under the repo root) — mirrored here
 * as a sibling of the content root rather than a second configurable root,
 * since the two are never actually independent of each other.
 */
const getLocalAssetsRoot = (): string =>
    path.join(getContentRoot(), "..", "assets");

const remoteAssetsUrlFor = (relativePath: string): string => {
    const base = new URL(getContentRoot());
    const assetsPathname = base.pathname.replace(/\/content$/, "/assets");
    const cleanPath = relativePath.replace(/^\/+|\/+$/g, "");

    return `${base.origin}${assetsPathname}${cleanPath ? `/${cleanPath}` : ""}${base.search}`;
};

const CONTENT_TYPES: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
};

const guessContentType = (relativePath: string): string =>
    CONTENT_TYPES[path.extname(relativePath).toLowerCase()] ??
    "application/octet-stream";

export interface AssetFile {
    data: Buffer;
    contentType: string;
}

/**
 * Deliberately separate from `readFileAt`/`listDirAt` below (which are
 * text-only, `utf-8`) — assets are binary, so they get their own small pair
 * of local/remote readers rather than overloading those with an encoding
 * flag.
 */
const loadAsset = async (relativePath: string): Promise<AssetFile | null> => {
    const data = isRemoteRoot()
        ? await fetchWithCache(
              remoteAssetsUrlFor(relativePath),
              "application/vnd.github.raw+json",
              async res => Buffer.from(await res.arrayBuffer())
          )
        : (() => {
              try {
                  return fs.readFileSync(
                      path.join(getLocalAssetsRoot(), relativePath)
                  );
              } catch {
                  return null;
              }
          })();

    return data ? { data, contentType: guessContentType(relativePath) } : null;
};

// --- unified accessors used by the rest of this module -------------------

const readFileAt = (relativePath: string): Promise<string | null> =>
    isRemoteRoot()
        ? remoteReadFile(relativePath)
        : Promise.resolve(localReadFile(relativePath));

const listDirAt = (relativePath: string): Promise<DirEntry[]> =>
    isRemoteRoot()
        ? remoteListDir(relativePath)
        : Promise.resolve(localListDir(relativePath));

const readMarkdownFile = async (
    relativePath: string
): Promise<ParsedMarkdown | null> => {
    const raw = await readFileAt(relativePath);

    return raw ? parseFrontmatter(raw) : null;
};

const walkMarkdownFiles = async (relativeDir: string): Promise<string[]> => {
    const entries = await listDirAt(relativeDir);
    const results = await Promise.all(
        entries.map(async entry => {
            const entryPath = relativeDir
                ? `${relativeDir}/${entry.name}`
                : entry.name;

            if (entry.isDirectory) {
                return walkMarkdownFiles(entryPath);
            }

            return entry.name.endsWith(".md") ? [entryPath] : [];
        })
    );

    return results.flat();
};

/**
 * WordPress auto-generates a page's slug from its title whenever no custom
 * slug was set, which is common on pages nobody bothered to hand-tune for
 * SEO. `id: "exploring-collections-data-custodians-and-data-custodian-networks"`
 * for `content/pages/support/collections.md` (title "Exploring Collections,
 * Data Custodians and Data Custodian Networks") is one of many such ids
 * scattered across `getContentPageByParentQuery` call sites — the filename
 * follows the crawled URL path, the id follows the title, and neither
 * matches the other.
 */
const slugify = (title: string): string =>
    title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");

/**
 * WordPress's "URI" page lookup only ever received a bare slug (e.g.
 * "data-custodians"), not a full path, because on the live site these pages
 * have no parent in the WP page hierarchy. The crawler in cms_spike organised
 * the same pages into subdirectories (e.g. pages/about/data-custodians.md)
 * for editorial reasons, so a flat slug needs a recursive fallback to find
 * the file WordPress's flat URI would have resolved to.
 *
 * Returns the parsed page directly (rather than a path to read separately)
 * so the exact-match attempt doesn't cost a second network round trip in
 * remote mode — the GET that checks existence already has the content.
 */
const loadPage = async (slugPath: string): Promise<ParsedMarkdown | null> => {
    const normalized = slugPath.replace(/^\/+|\/+$/g, "");
    const exact = await readMarkdownFile(`pages/${normalized}.md`);

    if (exact) return exact;

    const basename = `${path.basename(normalized)}.md`;
    const files = await walkMarkdownFiles("pages");
    const basenameMatch = files.find(file => path.basename(file) === basename);

    if (basenameMatch) return readMarkdownFile(basenameMatch);

    // Last resort, tried only once both cheaper lookups above have failed:
    // read every page and compare a slugified title, since that's the only
    // thing a title-derived id could possibly match against.
    const candidates = await Promise.all(files.map(readMarkdownFile));

    return (
        candidates.find(
            page => page && slugify(String(page.data.title ?? "")) === normalized
        ) ?? null
    );
};

interface CollectionEntry {
    slug: string;
    data: Record<string, string | boolean>;
    body: string;
}

const loadCollection = async (
    name: "news" | "events" | "releases"
): Promise<CollectionEntry[]> => {
    const entries = await listDirAt(name);
    const files = entries.filter(
        entry => !entry.isDirectory && entry.name.endsWith(".md")
    );

    const parsed = await Promise.all(
        files.map(async entry => {
            const page = await readMarkdownFile(`${name}/${entry.name}`);

            return page
                ? {
                      slug: entry.name.replace(/\.md$/, ""),
                      data: page.data,
                      body: page.body,
                  }
                : null;
        })
    );

    return parsed.filter((entry): entry is CollectionEntry => entry !== null);
};

interface PageTemplateDefaultLike {
    id: string;
    title: string;
    content: string;
    slug: string;
    categories?: { nodes: { name: string }[] };
}

/**
 * `content` is left as raw Markdown, not HTML. Next's App Router rejects any
 * module reachable from a Server Component that imports `react-dom/server`
 * (the usual way to turn a React tree into an HTML string), so pre-rendering
 * to HTML here isn't an option. `HTMLContent` renders this Markdown directly
 * client-side via `markdown-to-jsx` when `isMarkdownContentEnabled` is on —
 * see its own comment for why.
 */
const toPageTemplateDefault = (
    slug: string,
    parsed: ParsedMarkdown,
    categoryName?: string
): PageTemplateDefaultLike => ({
    id: slug,
    title: String(parsed.data.title ?? ""),
    content: parsed.body,
    slug,
    ...(categoryName && {
        categories: { nodes: [{ name: categoryName }] },
    }),
});

export {
    getContentRoot,
    isRemoteRoot,
    parseFrontmatter,
    readMarkdownFile,
    loadPage,
    loadCollection,
    loadAsset,
    toPageTemplateDefault,
};
export type { PageTemplateDefaultLike, CollectionEntry };
