// Temporarily disabled Google Fonts due to network issues in build environment
// import { Fira_Code as FontMono, Inter as FontSans } from "next/font/google";

// export const fontSans = FontSans({
//   subsets: ["latin"],
//   variable: "--font-sans",
// });

// export const fontMono = FontMono({
//   subsets: ["latin"],
//   variable: "--font-mono",
// });

// Fallback font configuration
export const fontSans = {
  variable: "--font-sans",
  style: { fontFamily: "system-ui, sans-serif" },
};

export const fontMono = {
  variable: "--font-mono",
  style: { fontFamily: "monospace" },
};
