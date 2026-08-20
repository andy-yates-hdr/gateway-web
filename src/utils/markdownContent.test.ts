import path from "path";

describe("markdownContent — local (fs) mode", () => {
    // No default is assumed any more, so the sibling cms_spike/content
    // checkout has to be pointed at explicitly, same as any other consumer
    // would need to.
    const LOCAL_CONTENT_ROOT = path.join(
        process.cwd(),
        "..",
        "..",
        "cms_spike",
        "content"
    );
    let markdownContent: typeof import("./markdownContent");

    beforeAll(async () => {
        process.env.MARKDOWN_CONTENT_ROOT = LOCAL_CONTENT_ROOT;
        jest.resetModules();
        markdownContent = await import("./markdownContent");
    });

    afterAll(() => {
        delete process.env.MARKDOWN_CONTENT_ROOT;
        jest.resetModules();
    });

    it("is not remote", () => {
        expect(markdownContent.isRemoteRoot()).toBe(false);
    });

    it("loads a real page from disk", async () => {
        const page = await markdownContent.loadPage("how-to-search");

        expect(page?.data.title).toBe("How to search the Gateway");
    });

    it("resolves a nested slug via the recursive basename fallback", async () => {
        const page = await markdownContent.loadPage("data-custodians");

        expect(page?.data.title).toBeTruthy();
    });

    it("resolves a title-derived id via the slugified-title fallback", async () => {
        // gateway-web's /support/collections route requests this exact id —
        // it's a slug WordPress derived from the page title, not the crawled
        // filename (collections.md).
        const page = await markdownContent.loadPage(
            "exploring-collections-data-custodians-and-data-custodian-networks"
        );

        expect(page?.data.title).toBe(
            "Exploring Collections, Data Custodians and Data Custodian Networks"
        );
    });

    it("loads a collection from disk", async () => {
        const releases = await markdownContent.loadCollection("releases");

        expect(releases.length).toBeGreaterThan(0);
    });

    it("returns null for a slug with no matching file", async () => {
        const page = await markdownContent.loadPage("does-not-exist-anywhere");

        expect(page).toBeNull();
    });

    it("loads a real image asset from the sibling assets/ directory", async () => {
        const asset = await markdownContent.loadAsset(
            "images/b3bd76fe-image.png"
        );

        expect(asset?.contentType).toBe("image/png");
        expect(asset?.data.length).toBeGreaterThan(0);
    });

    it("returns null for an asset that doesn't exist", async () => {
        const asset = await markdownContent.loadAsset(
            "images/does-not-exist.png"
        );

        expect(asset).toBeNull();
    });
});

describe("markdownContent — MARKDOWN_CONTENT_ROOT not set", () => {
    afterEach(() => {
        delete process.env.MARKDOWN_CONTENT_ROOT;
        jest.resetModules();
    });

    // Rejection is lazy, not at import time: cms.ts imports this module
    // unconditionally, but only calls into it from inside its
    // `isMarkdownContentEnabled()` branches — so importing with the env var
    // unset must succeed (the flag might be off), and only actually using
    // the module should fail.

    it("does not throw merely on import", async () => {
        delete process.env.MARKDOWN_CONTENT_ROOT;
        jest.resetModules();

        await expect(import("./markdownContent")).resolves.toBeDefined();
    });

    it("throws once actually used, not just imported", async () => {
        delete process.env.MARKDOWN_CONTENT_ROOT;
        jest.resetModules();
        const markdownContent = await import("./markdownContent");

        await expect(markdownContent.loadPage("anything")).rejects.toThrow(
            "MARKDOWN_CONTENT_ROOT is not set"
        );
    });

    it("also rejects a blank value, not just a missing one", async () => {
        process.env.MARKDOWN_CONTENT_ROOT = "";
        jest.resetModules();
        const markdownContent = await import("./markdownContent");

        await expect(markdownContent.loadPage("anything")).rejects.toThrow(
            "MARKDOWN_CONTENT_ROOT is not set"
        );
    });

    it("isRemoteRoot() and getContentRoot() both throw too, not just loadPage", async () => {
        delete process.env.MARKDOWN_CONTENT_ROOT;
        jest.resetModules();
        const markdownContent = await import("./markdownContent");

        expect(() => markdownContent.isRemoteRoot()).toThrow(
            "MARKDOWN_CONTENT_ROOT is not set"
        );
        expect(() => markdownContent.getContentRoot()).toThrow(
            "MARKDOWN_CONTENT_ROOT is not set"
        );
    });

    it("isMarkdownContentSourceRemote() swallows the unset-root error instead of throwing", async () => {
        delete process.env.MARKDOWN_CONTENT_ROOT;
        jest.resetModules();
        const markdownContent = await import("./markdownContent");

        expect(markdownContent.isMarkdownContentSourceRemote()).toBe(false);
    });
});

describe("markdownContent — remote (GitHub Contents API) mode", () => {
    const CONTENT_ROOT =
        "https://api.github.com/repos/HDRUK/techspike-wordpress-replacement/contents/content?ref=main";
    let markdownContent: typeof import("./markdownContent");
    let fetchMock: jest.Mock;

    beforeAll(async () => {
        process.env.MARKDOWN_CONTENT_ROOT = CONTENT_ROOT;
        process.env.MARKDOWN_CONTENT_GITHUB_TOKEN = "test-token";
        // Caching is exercised in its own describe block below; disabling it
        // here keeps these tests' mocked fetch sequences deterministic
        // regardless of shared URLs across tests.
        process.env.MARKDOWN_CONTENT_CACHE_TTL_SECONDS = "0";
        jest.resetModules();
        markdownContent = await import("./markdownContent");
    });

    afterAll(() => {
        delete process.env.MARKDOWN_CONTENT_ROOT;
        delete process.env.MARKDOWN_CONTENT_GITHUB_TOKEN;
        delete process.env.MARKDOWN_CONTENT_CACHE_TTL_SECONDS;
        jest.resetModules();
    });

    /** GitHub's real headers are read for the ETag; unrelated to caching
     * behaviour tested elsewhere, this defaults to "no ETag" so every mocked
     * response here doesn't need to opt in individually. */
    const noEtagHeaders = { get: () => null };

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    it("is remote", () => {
        expect(markdownContent.isRemoteRoot()).toBe(true);
        expect(markdownContent.isMarkdownContentSourceRemote()).toBe(true);
    });

    it("fetches a page from the GitHub Contents API with the raw Accept header and bearer token", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            headers: noEtagHeaders,
            text: async () => "---\ntitle: How to search\n---\n\nBody text.",
        });

        const page = await markdownContent.loadPage("how-to-search");

        expect(page?.data.title).toBe("How to search");
        expect(page?.body).toBe("Body text.");
        expect(fetchMock).toHaveBeenCalledWith(
            `${CONTENT_ROOT.replace("?ref=main", "")}/pages/how-to-search.md?ref=main`,
            {
                headers: {
                    Accept: "application/vnd.github.raw+json",
                    Authorization: "Bearer test-token",
                },
            }
        );
    });

    it("falls back to a recursive directory listing when the exact path 404s", async () => {
        fetchMock
            // exact path miss
            .mockResolvedValueOnce({ ok: false })
            // listing content/pages
            .mockResolvedValueOnce({
                ok: true,
                headers: noEtagHeaders,
                json: async () => [{ name: "about", type: "dir" }],
            })
            // listing content/pages/about
            .mockResolvedValueOnce({
                ok: true,
                headers: noEtagHeaders,
                json: async () => [
                    { name: "data-custodians.md", type: "file" },
                ],
            })
            // final content fetch for the matched file
            .mockResolvedValueOnce({
                ok: true,
                headers: noEtagHeaders,
                text: async () => "---\ntitle: For Data Custodians\n---\n\nBody.",
            });

        const page = await markdownContent.loadPage("data-custodians");

        expect(page?.data.title).toBe("For Data Custodians");
    });

    it("falls back to matching a slugified title when neither path-based lookup finds a file", async () => {
        fetchMock
            // exact path miss
            .mockResolvedValueOnce({ ok: false })
            // listing content/pages
            .mockResolvedValueOnce({
                ok: true,
                headers: noEtagHeaders,
                json: async () => [{ name: "collections.md", type: "file" }],
            })
            // reading every candidate for the title-slug comparison
            .mockResolvedValueOnce({
                ok: true,
                headers: noEtagHeaders,
                text: async () =>
                    "---\ntitle: Exploring Collections, Data Custodians and Data Custodian Networks\n---\n\nBody.",
            });

        const page = await markdownContent.loadPage(
            "exploring-collections-data-custodians-and-data-custodian-networks"
        );

        expect(page?.data.title).toBe(
            "Exploring Collections, Data Custodians and Data Custodian Networks"
        );
    });

    it("loads a collection by listing the directory then fetching each file", async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                headers: noEtagHeaders,
                json: async () => [{ name: "a-release.md", type: "file" }],
            })
            .mockResolvedValueOnce({
                ok: true,
                headers: noEtagHeaders,
                text: async () => "---\ntitle: A Release\ndate: 2024-01-01\n---\n\nBody.",
            });

        const releases = await markdownContent.loadCollection("releases");

        expect(releases).toEqual([
            { slug: "a-release", data: { title: "A Release", date: "2024-01-01" }, body: "Body." },
        ]);
    });

    it("returns null rather than throwing when the API call fails and nothing is cached", async () => {
        fetchMock.mockRejectedValue(new Error("network error"));

        // A slug untouched by any earlier test in this block — no stale
        // cache entry exists to fall back to (see the dedicated caching
        // describe block below for that behaviour).
        const page = await markdownContent.loadPage(
            "network-error-test-page-never-cached"
        );

        expect(page).toBeNull();
    });

    it("fetches an image asset from the sibling assets path, not content", async () => {
        const bytes = new Uint8Array([1, 2, 3]);

        fetchMock.mockResolvedValueOnce({
            ok: true,
            headers: noEtagHeaders,
            arrayBuffer: async () => bytes.buffer,
        });

        const asset = await markdownContent.loadAsset("images/foo.png");

        expect(asset?.contentType).toBe("image/png");
        expect(Array.from(asset?.data ?? [])).toEqual([1, 2, 3]);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.github.com/repos/HDRUK/techspike-wordpress-replacement/contents/assets/images/foo.png?ref=main",
            {
                headers: {
                    Accept: "application/vnd.github.raw+json",
                    Authorization: "Bearer test-token",
                },
            }
        );
    });

    it("returns null for an asset request that fails", async () => {
        fetchMock.mockResolvedValueOnce({ ok: false });

        const asset = await markdownContent.loadAsset("images/missing.png");

        expect(asset).toBeNull();
    });
});

describe("markdownContent — remote mode caching", () => {
    const CONTENT_ROOT =
        "https://api.github.com/repos/HDRUK/techspike-wordpress-replacement/contents/content?ref=main";
    let fetchMock: jest.Mock;

    const importFresh = async (env: Record<string, string>) => {
        process.env.MARKDOWN_CONTENT_ROOT = CONTENT_ROOT;
        delete process.env.MARKDOWN_CONTENT_GITHUB_TOKEN;
        delete process.env.MARKDOWN_CONTENT_CACHE_TTL_SECONDS;
        delete process.env.MARKDOWN_CONTENT_ETAG_CHECK;
        Object.assign(process.env, env);
        jest.resetModules();
        return import("./markdownContent");
    };

    const okResponse = (body: string, etag: string | null = null) => ({
        ok: true,
        status: 200,
        headers: {
            get: (name: string) =>
                name.toLowerCase() === "etag" ? etag : null,
        },
        text: async () => body,
    });

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        delete process.env.MARKDOWN_CONTENT_ROOT;
        delete process.env.MARKDOWN_CONTENT_GITHUB_TOKEN;
        delete process.env.MARKDOWN_CONTENT_CACHE_TTL_SECONDS;
        delete process.env.MARKDOWN_CONTENT_ETAG_CHECK;
        jest.resetModules();
    });

    it("serves from cache within the TTL, without a second network call", async () => {
        const markdownContent = await importFresh({
            MARKDOWN_CONTENT_CACHE_TTL_SECONDS: "60",
        });

        fetchMock.mockResolvedValueOnce(
            okResponse("---\ntitle: Cached Page\n---\n\nBody.")
        );

        const first = await markdownContent.loadPage("cached-page");
        const second = await markdownContent.loadPage("cached-page");

        expect(first?.data.title).toBe("Cached Page");
        expect(second?.data.title).toBe("Cached Page");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("re-fetches unconditionally once the TTL has expired, when ETag checking is off", async () => {
        const markdownContent = await importFresh({
            MARKDOWN_CONTENT_CACHE_TTL_SECONDS: "60",
        });

        fetchMock
            .mockResolvedValueOnce(
                okResponse("---\ntitle: Version One\n---\n\nBody.")
            )
            .mockResolvedValueOnce(
                okResponse("---\ntitle: Version Two\n---\n\nBody.")
            );

        const first = await markdownContent.loadPage("expiring-page");
        jest.setSystemTime(Date.now() + 61_000);
        const second = await markdownContent.loadPage("expiring-page");

        expect(first?.data.title).toBe("Version One");
        expect(second?.data.title).toBe("Version Two");
        expect(fetchMock).toHaveBeenCalledTimes(2);

        const secondCallHeaders = fetchMock.mock.calls[1][1].headers;
        expect(secondCallHeaders["If-None-Match"]).toBeUndefined();
    });

    it("disables caching outright when the TTL is 0", async () => {
        const markdownContent = await importFresh({
            MARKDOWN_CONTENT_CACHE_TTL_SECONDS: "0",
        });

        fetchMock.mockResolvedValue(
            okResponse("---\ntitle: Always Fresh\n---\n\nBody.")
        );

        await markdownContent.loadPage("zero-ttl-page");
        await markdownContent.loadPage("zero-ttl-page");

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("revalidates via If-None-Match and reuses the cached value on a 304, when ETag checking is on", async () => {
        const markdownContent = await importFresh({
            MARKDOWN_CONTENT_CACHE_TTL_SECONDS: "60",
            MARKDOWN_CONTENT_ETAG_CHECK: "true",
        });

        fetchMock
            .mockResolvedValueOnce(
                okResponse("---\ntitle: Unchanged\n---\n\nBody.", '"etag-v1"')
            )
            .mockResolvedValueOnce({
                ok: false,
                status: 304,
                headers: { get: () => null },
            });

        const first = await markdownContent.loadPage("revalidated-page");
        jest.setSystemTime(Date.now() + 61_000);
        const second = await markdownContent.loadPage("revalidated-page");

        expect(first?.data.title).toBe("Unchanged");
        expect(second?.data.title).toBe("Unchanged");
        expect(fetchMock).toHaveBeenCalledTimes(2);

        const secondCallHeaders = fetchMock.mock.calls[1][1].headers;
        expect(secondCallHeaders["If-None-Match"]).toBe('"etag-v1"');
    });

    it("fetches fresh content when the ETag has changed, when ETag checking is on", async () => {
        const markdownContent = await importFresh({
            MARKDOWN_CONTENT_CACHE_TTL_SECONDS: "60",
            MARKDOWN_CONTENT_ETAG_CHECK: "true",
        });

        fetchMock
            .mockResolvedValueOnce(
                okResponse("---\ntitle: Old Content\n---\n\nBody.", '"etag-v1"')
            )
            .mockResolvedValueOnce(
                okResponse("---\ntitle: New Content\n---\n\nBody.", '"etag-v2"')
            );

        const first = await markdownContent.loadPage("changed-page");
        jest.setSystemTime(Date.now() + 61_000);
        const second = await markdownContent.loadPage("changed-page");

        expect(first?.data.title).toBe("Old Content");
        expect(second?.data.title).toBe("New Content");
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("falls back to a stale cached value when a network exception occurs after the TTL has expired", async () => {
        const markdownContent = await importFresh({
            MARKDOWN_CONTENT_CACHE_TTL_SECONDS: "60",
        });

        fetchMock.mockResolvedValueOnce(
            okResponse("---\ntitle: Last Known Good\n---\n\nBody.")
        );

        const first = await markdownContent.loadPage("flaky-page");
        jest.setSystemTime(Date.now() + 61_000);
        fetchMock.mockRejectedValueOnce(new Error("network error"));
        const second = await markdownContent.loadPage("flaky-page");

        expect(first?.data.title).toBe("Last Known Good");
        expect(second?.data.title).toBe("Last Known Good");
    });
});
