import { createTheme } from "@mui/material/styles";

import pattern from "@/assets/images/pattern.webp";

/** The original app's colours: black UI on a camouflage pattern, orange on hover. */
export const brand = {
  black: "#000000",
  white: "#ffffff",
  accent: "#ff5c33",
} as const;

export const theme = createTheme({
  palette: {
    primary: { main: brand.black, contrastText: brand.white },
    secondary: { main: brand.accent, contrastText: brand.black },
    background: { default: brand.white },
  },
  typography: {
    fontFamily: '"Montserrat", system-ui, sans-serif',
    // The original sized everything in rem on a 10px root (html { font-size: 62.5% }).
    htmlFontSize: 10,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { fontSize: "62.5%" },
        body: { backgroundImage: `url(${pattern})` },
        // The original zeroed every margin; components space their own content.
        "h1, h2, h3, h4, h5, h6, p, figure, blockquote, ul, ol": { margin: 0 },
        a: { color: "inherit", textDecoration: "none" },
        // Keyboard users see where they are (the original removed every outline).
        ":focus-visible": { outline: `0.3rem solid ${brand.accent}`, outlineOffset: "0.2rem" },
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            transitionDuration: "0.01ms !important",
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: "0.5rem",
          variants: [
            {
              props: { variant: "contained", color: "primary" },
              style: {
                transition: "background-color 0.3s ease-in, color 0.3s ease-in",
                // Black text on the orange: white on #ff5c33 is below the WCAG contrast minimum.
                "&:hover": { backgroundColor: brand.accent, color: brand.black },
              },
            },
          ],
        },
      },
    },
  },
});
