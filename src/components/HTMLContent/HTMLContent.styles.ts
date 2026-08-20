import { styled } from "@mui/material";

export const Content = styled("div")(({ theme }) => ({
    h5: {
        fontSize: 18,
    },
    a: {
        color: theme.palette.secondary.main,
        ":hover": {
            textDecoration: "none",
        },
    },
}));

export const MarkdownSourceBanner = styled("div")(({ theme }) => ({
    display: "inline-block",
    marginBottom: theme.spacing(1.5),
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 12,
    fontFamily: "monospace",
    color: theme.palette.warning.contrastText,
    backgroundColor: theme.palette.warning.main,
}));
