"use client";

import React, { useState } from "react";
import { toPublicAssetUrl } from "@/utils/markdownAssetUrl";
import {
    Figure,
    FigureCaption,
    MarkdownImg,
    PlayIcon,
    VideoCaption,
    VideoFigure,
    VideoIframeWrapper,
    VideoNote,
    VideoPoster,
    VideoTrigger,
} from "./MarkdownMedia.styles";

type Alignment = "left" | "right" | "center";

/**
 * WordPress's block editor writes `class="alignleft"`/`"alignright"`/
 * `"aligncenter"` on images — recognised here so an author can write the
 * same thing directly as raw HTML in a Markdown body
 * (`<img src="..." class="alignleft">`) to override the centered default,
 * with no custom syntax: CommonMark passes raw HTML through unchanged, and
 * markdown-to-jsx parses `class` into `className` the same as any other
 * attribute.
 */
const alignmentFromClassName = (className?: string): Alignment => {
    if (className?.includes("alignleft")) return "left";
    if (className?.includes("alignright")) return "right";
    return "center";
};

/**
 * Two behaviours ported from the `cms_spike` Astro spike (`markdown-media.mjs`),
 * where they ran as Sätteri hast plugins over the same CommonMark. Neither
 * needs custom Markdown syntax — a captioned image is just `![alt](src
 * "caption")`, and an embedded video is just a bare link to a YouTube URL on
 * its own line — so both are detected here by shape by overriding `p`, since
 * markdown-to-jsx has no plugin/visitor system of its own.
 */

/** Accepts /embed/ID, watch?v=ID and youtu.be/ID, with any query string. */
const youTubeId = (url: string): string | null => {
    const patterns = [
        /(?:youtube\.com|youtube-nocookie\.com)\/embed\/([A-Za-z0-9_-]{6,})/,
        /(?:youtube\.com|youtube-nocookie\.com)\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{6,})/,
        /youtu\.be\/([A-Za-z0-9_-]{6,})/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }

    return null;
};

const extractText = (node: React.ReactNode): string => {
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(extractText).join("");
    if (React.isValidElement(node)) {
        return extractText((node.props as { children?: React.ReactNode }).children);
    }
    return "";
};

/** Children with whitespace-only text nodes filtered out, so a lone image or
 * link surrounded by blank lines (rather than truly alone) is still detected. */
const meaningfulChildren = (children: React.ReactNode): React.ReactNode[] =>
    React.Children.toArray(children).filter(
        child => typeof child !== "string" || child.trim().length > 0
    );

const MarkdownImage = ({
    src,
    alt = "",
    title,
    className,
    ...rest
}: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <MarkdownImg
        src={toPublicAssetUrl(src ?? "")}
        alt={alt}
        title={title}
        className={className}
        data-align={alignmentFromClassName(className)}
        {...rest}
    />
);

/**
 * Click-to-load: nothing is requested from YouTube until the reader presses
 * play — for a health-data organisation, the difference between "we embed
 * videos" and "we disclose every reader to a third party" on every page
 * view. The poster is served locally (via the same `markdown-assets` route
 * as any other image) rather than from i.ytimg.com, which would leak the
 * visit just the same.
 */
const VideoFacade = ({ id, title }: { id: string; title: string }) => {
    const [playing, setPlaying] = useState(false);

    if (playing) {
        return (
            <VideoFigure>
                <VideoIframeWrapper>
                    <iframe
                        src={`https://www.youtube.com/embed/${id}`}
                        title={title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        loading="lazy"
                    />
                </VideoIframeWrapper>
                <VideoCaption>{title}</VideoCaption>
            </VideoFigure>
        );
    }

    return (
        <VideoFigure>
            <VideoTrigger
                type="button"
                aria-label={`Play video: ${title}`}
                onClick={() => setPlaying(true)}>
                <VideoPoster
                    src={toPublicAssetUrl(
                        `/assets/images/video-posters/${id}.jpg`
                    )}
                    alt=""
                    loading="lazy"
                />
                <PlayIcon aria-hidden="true">▶</PlayIcon>
            </VideoTrigger>
            <VideoCaption>
                {title}
                <VideoNote>
                    Plays from YouTube — nothing is loaded until you press play
                </VideoNote>
            </VideoCaption>
        </VideoFigure>
    );
};

/**
 * A paragraph containing nothing but one image or one YouTube link is
 * replaced with the richer markup above; everything else renders as an
 * ordinary `<p>`, exactly as before this override existed.
 */
const MarkdownParagraph = ({
    children,
    ...rest
}: React.HTMLAttributes<HTMLParagraphElement>) => {
    const items = meaningfulChildren(children);

    if (items.length === 1 && React.isValidElement(items[0])) {
        const only = items[0];

        if (only.type === MarkdownImage) {
            // `title` alone drives the caption — kept separate from `alt`,
            // which stays the image's own accessible description
            // (`![alt](src "caption")` is standard CommonMark, so this needs
            // no custom syntax). A caption is only rendered when a title was
            // actually given.
            const { title } = only.props as { title?: string };

            if (title) {
                return (
                    <Figure>
                        {only}
                        <FigureCaption>{title}</FigureCaption>
                    </Figure>
                );
            }
        }

        if (only.type === "a") {
            const { href, children: linkChildren } = only.props as {
                href?: string;
                children?: React.ReactNode;
            };
            const id = youTubeId(href ?? "");

            if (id) {
                const title = extractText(linkChildren).trim() || "Watch this video";

                return <VideoFacade id={id} title={title} />;
            }
        }
    }

    return <p {...rest}>{children}</p>;
};

export { MarkdownImage, MarkdownParagraph, youTubeId };
