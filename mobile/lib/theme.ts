import { Platform } from "react-native";

// Mirrors web's app/globals.css :root tokens exactly, so the mobile app
// reads as the same product rather than an approximation of it.
// v2 look (2026-11-09): the v2 prototype's palette (design/v2-prototype).
export const colors = {
  bg: "#000000",
  surface: "#0d0d0d",
  surface2: "#161616",
  line: "#262626",
  lineSoft: "#1c1c1c",
  lineStrong: "#333333",
  ink: "#f2f2f2",
  ink2: "#e6e6e6",
  ink3: "#9a9a9a",
  red: "#e10b2c",
  redSoft: "#ff3b4e",
  redTint: "#1c050a",
  amber: "#d99a2b",
  green: "#17c964",
  blue: "#5b8fd6",
};

// Web's --font-serif is Georgia (the v2 prototype's display face). It ships
// with iOS but not Android — "serif" there resolves to the platform's
// default serif (Noto Serif), the closest built-in match without shipping a
// custom font file.
export const fonts = {
  serif: Platform.select({ ios: "Georgia", default: "serif" }),
};
