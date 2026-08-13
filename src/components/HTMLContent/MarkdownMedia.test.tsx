import { fireEvent, render, screen } from "@testing-library/react";
import Markdown from "markdown-to-jsx";
import { MarkdownImage, MarkdownParagraph, youTubeId } from "./MarkdownMedia";

describe("youTubeId", () => {
    it.each([
        [
            "https://www.youtube.com/embed/CobSWnXwCNg?feature=oembed",
            "CobSWnXwCNg",
        ],
        ["https://www.youtube.com/watch?v=CobSWnXwCNg", "CobSWnXwCNg"],
        ["https://youtu.be/CobSWnXwCNg", "CobSWnXwCNg"],
        ["https://example.com/not-youtube", null],
    ])("%s -> %s", (url, expected) => {
        expect(youTubeId(url)).toBe(expected);
    });
});

describe("MarkdownParagraph", () => {
    it("renders a plain paragraph unchanged", () => {
        render(<MarkdownParagraph>Just some text.</MarkdownParagraph>);

        expect(screen.getByText("Just some text.").tagName).toBe("P");
    });

    it("wraps a lone captioned image in a figure with a figcaption", () => {
        const { container } = render(
            <MarkdownParagraph>
                <MarkdownImage src="/assets/images/foo.png" title="A caption" />
            </MarkdownParagraph>
        );

        expect(screen.getByText("A caption").tagName).toBe("FIGCAPTION");
        expect(container.querySelector("img")).toHaveAttribute(
            "src",
            "/api/markdown-assets/images/foo.png"
        );
    });

    it("uses only title for the caption, never alt", () => {
        render(
            <MarkdownParagraph>
                <MarkdownImage
                    src="/assets/images/foo.png"
                    alt="Alt text"
                    title="Title text"
                />
            </MarkdownParagraph>
        );

        expect(screen.getByText("Title text").tagName).toBe("FIGCAPTION");
        expect(screen.queryByText("Alt text")).toBeNull();
    });

    it("renders no caption when only alt is set, with no title", () => {
        const { container } = render(
            <MarkdownParagraph>
                <MarkdownImage src="/assets/images/foo.png" alt="Alt text" />
            </MarkdownParagraph>
        );

        expect(container.querySelector("figure")).toBeNull();
        expect(container.querySelector("p")).not.toBeNull();
    });

    it("leaves a lone image with no caption as a plain paragraph", () => {
        const { container } = render(
            <MarkdownParagraph>
                <MarkdownImage src="/assets/images/foo.png" />
            </MarkdownParagraph>
        );

        expect(container.querySelector("figure")).toBeNull();
        expect(container.querySelector("p")).not.toBeNull();
    });

    it("replaces a lone YouTube link with a click-to-play facade", () => {
        render(
            <MarkdownParagraph>
                <a href="https://www.youtube.com/embed/CobSWnXwCNg?feature=oembed">
                    Searching for Datasets
                </a>
            </MarkdownParagraph>
        );

        expect(
            screen.getByRole("button", { name: /Play video: Searching for Datasets/ })
        ).toBeInTheDocument();
        expect(screen.getByText("Searching for Datasets")).toBeInTheDocument();
        expect(screen.queryByTitle("Searching for Datasets")).toBeNull();
    });

    it("loads the real iframe only after the play button is pressed", () => {
        render(
            <MarkdownParagraph>
                <a href="https://www.youtube.com/embed/CobSWnXwCNg?feature=oembed">
                    Searching for Datasets
                </a>
            </MarkdownParagraph>
        );

        expect(screen.queryByTitle("Searching for Datasets")).toBeNull();

        fireEvent.click(
            screen.getByRole("button", { name: /Play video: Searching for Datasets/ })
        );

        const iframe = screen.getByTitle("Searching for Datasets");
        expect(iframe.tagName).toBe("IFRAME");
        expect(iframe).toHaveAttribute(
            "src",
            "https://www.youtube.com/embed/CobSWnXwCNg"
        );
    });

    it("leaves a lone non-YouTube link as a plain paragraph", () => {
        const { container } = render(
            <MarkdownParagraph>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- stands in for markdown-to-jsx's own plain <a> rendering, not app navigation */}
                <a href="/support/data-access-request/submit-enquiry">here</a>
            </MarkdownParagraph>
        );

        expect(container.querySelector("figure")).toBeNull();
        expect(container.querySelector("p")).not.toBeNull();
    });
});

describe("MarkdownImage alignment", () => {
    it("centers by default", () => {
        const { container } = render(<MarkdownImage src="/assets/images/foo.png" />);

        expect(container.querySelector("img")).toHaveAttribute(
            "data-align",
            "center"
        );
    });

    it.each([
        ["alignleft", "left"],
        ["alignright", "right"],
        ["aligncenter", "center"],
    ])("maps class=%s to data-align=%s", (className, expected) => {
        const { container } = render(
            <MarkdownImage src="/assets/images/foo.png" className={className} />
        );

        expect(container.querySelector("img")).toHaveAttribute(
            "data-align",
            expected
        );
    });

    it("is controllable from plain Markdown, via raw HTML alignment classes", () => {
        // The exact override wiring HTMLContent uses, exercised end-to-end
        // through markdown-to-jsx's own HTML parsing — not just the
        // component in isolation — to prove this is actually reachable from
        // a Markdown source string, not only from a direct React prop.
        const { container } = render(
            <Markdown options={{ overrides: { img: { component: MarkdownImage } } }}>
                {'<img src="/assets/images/foo.png" alt="" class="alignleft">'}
            </Markdown>
        );

        expect(container.querySelector("img")).toHaveAttribute(
            "data-align",
            "left"
        );
    });
});
