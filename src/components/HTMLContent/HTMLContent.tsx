"use client";

import DOMPurify from "isomorphic-dompurify";
import Markdown from "markdown-to-jsx";
import { useFeatures } from "@/providers/FeatureProvider";
import { MarkdownImage, MarkdownParagraph } from "./MarkdownMedia";
import { Content } from "./HTMLContent.styles";

export interface HTMLContentProps {
    content: string;
}

/**
 * `content` is an HTML string from WordPress, except when
 * `isMarkdownContentEnabled` is on, where `@/utils/cms`'s Markdown branch
 * puts raw Markdown here instead (see `markdownContent.ts` for why it isn't
 * pre-rendered to HTML: Next's App Router forbids `react-dom/server` in any
 * module reachable from a Server Component). `markdown-to-jsx` renders that
 * case directly, client-side, rather than going through
 * dangerouslySetInnerHTML + DOMPurify.
 */
const HTMLContent = ({ content }: HTMLContentProps) => {
    const { isMarkdownContentEnabled } = useFeatures();

    if (isMarkdownContentEnabled) {
        return (
            <Content>
                <Markdown
                    options={{
                        overrides: {
                            img: { component: MarkdownImage },
                            p: { component: MarkdownParagraph },
                        },
                    }}>
                    {content}
                </Markdown>
            </Content>
        );
    }

    return (
        <Content
            dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(content, {
                    ADD_TAGS: ["iframe"],
                    ADD_ATTR: [
                        "allow",
                        "allowfullscreen",
                        "frameborder",
                        "scrolling",
                    ],
                }),
            }}
        />
    );
};

export default HTMLContent;
