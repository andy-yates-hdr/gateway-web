import { toPublicAssetUrl } from "./markdownAssetUrl";

describe("toPublicAssetUrl", () => {
    it("rewrites a site-root-relative assets path to the markdown-assets route", () => {
        expect(toPublicAssetUrl("/assets/images/foo.png")).toBe(
            "/api/markdown-assets/images/foo.png"
        );
    });

    it("handles a path without a leading slash", () => {
        expect(toPublicAssetUrl("assets/images/foo.png")).toBe(
            "/api/markdown-assets/images/foo.png"
        );
    });

    it("leaves an unrelated absolute URL untouched", () => {
        expect(toPublicAssetUrl("https://example.com/foo.png")).toBe(
            "https://example.com/foo.png"
        );
    });

    it("leaves an empty string untouched", () => {
        expect(toPublicAssetUrl("")).toBe("");
    });
});
