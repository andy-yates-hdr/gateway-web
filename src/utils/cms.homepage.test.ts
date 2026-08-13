import path from "path";

const sessionId = "123421";

jest.mock("next/headers", () => ({
    cookies: jest.fn(() => ({
        get: jest.fn().mockReturnValue({ value: sessionId }),
    })),
}));
jest.mock("@/flags", () => ({
    isMarkdownContentEnabled: jest.fn().mockResolvedValue(true),
}));

describe("getHomePage — Markdown fallback", () => {
    let getHomePage: typeof import("@/utils/cms").getHomePage;

    beforeAll(async () => {
        process.env.MARKDOWN_CONTENT_ROOT = path.join(
            process.cwd(),
            "..",
            "..",
            "cms_spike",
            "content"
        );
        ({ getHomePage } = await import("@/utils/cms"));
    });

    afterAll(() => {
        delete process.env.MARKDOWN_CONTENT_ROOT;
    });

    it("renders without WordPress, with real news/events posts and blank ACF-only fields", async () => {
        const home = await getHomePage();

        // Real data: the same source getNews()/getEvents() use.
        expect(home.posts.edges.length).toBeGreaterThan(0);
        expect(home.posts.edges.length).toBeLessThanOrEqual(4);
        expect(home.posts.edges[0].node.newsFields.headline).toBeTruthy();

        // No ACF equivalent exists anywhere in the crawled content — left
        // blank/empty rather than invented, and safe for the consuming
        // components (HTMLVideoEmbed, LogoSlider) to receive as such.
        expect(home.page.template.homeFields.gatewayVideo).toBe("");
        expect(home.page.template.homeFields.logos).toEqual([]);
        expect(home.page.template.meetTheTeam.image.node.sourceUrl).toBe("");
    });
});
