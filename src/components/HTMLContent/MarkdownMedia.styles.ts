import { styled } from "@mui/material";

/**
 * Centered by default; overridden by `data-align` (see `MarkdownImage`),
 * which an author sets by writing plain raw HTML in the Markdown body —
 * `<img src="..." class="alignleft">` — reusing the WordPress block-editor
 * alignment class names, standard CommonMark passes raw HTML through
 * unchanged, so this needs no custom syntax. Deliberately not relying on the
 * existing `.wpStyles .aligncenter` rule in `wpStyles.css`: not every page
 * that renders Markdown wraps its content in `.wpStyles`.
 */
export const MarkdownImg = styled("img")({
    display: "block",
    maxWidth: "100%",
    margin: "0 auto",
    '&[data-align="left"]': {
        margin: "0.5em 1em 0.5em 0",
        float: "left",
    },
    '&[data-align="right"]': {
        margin: "0.5em 0 0.5em 1em",
        float: "right",
    },
});

export const Figure = styled("figure")(({ theme }) => ({
    margin: theme.spacing(3, 0),
    textAlign: "center",
}));

export const FigureCaption = styled("figcaption")(({ theme }) => ({
    marginTop: theme.spacing(1),
    fontSize: 14,
    color: theme.palette.text.secondary,
}));

export const VideoFigure = styled("figure")(({ theme }) => ({
    margin: theme.spacing(3, 0),
}));

export const VideoTrigger = styled("button")(({ theme }) => ({
    position: "relative",
    display: "block",
    width: "100%",
    aspectRatio: "16 / 9",
    padding: 0,
    border: "none",
    borderRadius: theme.shape.borderRadius,
    overflow: "hidden",
    cursor: "pointer",
    backgroundColor: theme.palette.grey[900],
}));

export const VideoPoster = styled("img")({
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
});

export const PlayIcon = styled("span")(({ theme }) => ({
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 64,
    height: 64,
    borderRadius: "50%",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    color: theme.palette.common.white,
    fontSize: 24,
}));

export const VideoIframeWrapper = styled("div")({
    position: "relative",
    width: "100%",
    aspectRatio: "16 / 9",
    "& iframe": {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
    },
});

export const VideoCaption = styled("figcaption")(({ theme }) => ({
    marginTop: theme.spacing(1),
    fontSize: 14,
    color: theme.palette.text.secondary,
}));

export const VideoNote = styled("span")({
    display: "block",
    fontStyle: "italic",
});
