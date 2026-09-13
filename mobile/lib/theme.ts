import { Platform } from "react-native";

// Mirrors web's app/globals.css :root tokens exactly, so the mobile app
// reads as the same product rather than an approximation of it.
export const colors = {
  bg: "#0a0a0b",
  surface: "#121214",
  surface2: "#1a1a1d",
  line: "#38383f",
  lineSoft: "#232328",
  lineStrong: "#4a4a53",
  ink: "#f2f2f4",
  ink2: "#a8a8b0",
  ink3: "#6e6e78",
  red: "#e11d2e",
  redSoft: "#ff5566",
  amber: "#d99a2b",
  green: "#3f9e6b",
  blue: "#5b8fd6",
};

// Web's --font-serif (Iowan Old Style) is an iOS system font but doesn't
// exist on Android — "serif" there resolves to the platform's default serif
// (Noto Serif/Droid Serif), the closest built-in match without shipping a
// custom font file.
export const fonts = {
  serif: Platform.select({ ios: "Iowan Old Style", default: "serif" }),
};
