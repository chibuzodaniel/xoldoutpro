import { Svg, Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import type { GiftType } from "../../lib/liveTypes";

// Ported line-for-line from web's components/live/LiveIcons.tsx — same
// viewBox/paths, just JSX-cased for react-native-svg (same convention as
// NavIcons.tsx).
type IconProps = { color?: string; size?: number };

export function BroadcastIcon({ color = "#fff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <Circle cx={12} cy={12} r={2} fill={color} stroke="none" />
      <Path d="M8.2 8.2a5.4 5.4 0 000 7.6M15.8 8.2a5.4 5.4 0 010 7.6" />
      <Path d="M5.3 5.3a9.5 9.5 0 000 13.4M18.7 5.3a9.5 9.5 0 010 13.4" />
    </Svg>
  );
}

export function EyeIcon({ color = "#fff", size = 14 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" strokeLinejoin="round" />
      <Circle cx={12} cy={12} r={3} />
    </Svg>
  );
}

export function ShieldIcon({ color = "#6e6e78", size = 14 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" />
      <Path d="M9 12l2 2 4-4" />
    </Svg>
  );
}

export function MicLineIcon({ color = "#fff", size = 22, muted = false }: IconProps & { muted?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <Rect x={9} y={3} width={6} height={11} rx={3} />
      <Path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" />
      {muted && <Path d="M4 4l16 16" />}
    </Svg>
  );
}

export function FlipCameraIcon({ color = "#fff", size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 8.5A2.5 2.5 0 016.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0120 8.5v9a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5v-9z" />
      <Path d="M9 12.5a3 3 0 015.3-1.9M15 13.5a3 3 0 01-5.3 1.9" />
      <Path d="M14.6 9v1.8h-1.8M9.4 17v-1.8h1.8" />
    </Svg>
  );
}

export function CameraOffIcon({ color = "#e11d2e", size = 34 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 7.5A1.5 1.5 0 014.5 6H14a1.5 1.5 0 011.5 1.5v9A1.5 1.5 0 0114 18H4.5A1.5 1.5 0 013 16.5v-9zM15.5 10.5L21 7v10l-5.5-3.5" />
      <Path d="M2.5 3.5l19 17" />
    </Svg>
  );
}

export function RefreshIcon({ color = "#fff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 11a8 8 0 00-14.3-4.6L4 8M4 4v4h4M4 13a8 8 0 0014.3 4.6L20 16M20 20v-4h-4" />
    </Svg>
  );
}

export function CloseIcon({ color = "#fff", size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
      <Path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

// The gold "X" XG coin from the mockup.
export function XgCoin({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={11} fill="#e7b33a" />
      <Circle cx={12} cy={12} r={11} fill="none" stroke="#a86f12" strokeWidth={1.2} />
      <Circle cx={12} cy={12} r={8.2} fill="none" stroke="#a86f12" strokeWidth={1} />
      <Path d="M8.8 8.6l6.4 6.8M15.2 8.6l-6.4 6.8" stroke="#7a4f08" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// Illustrated, colored gift art — the sheet tiles and the big celebration.
export function GiftArt({ type, size = 40 }: { type: GiftType; size?: number }) {
  switch (type) {
    case "STAR":
      return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
          <Path
            d="M24 4.5l5.9 12 13.2 1.9-9.6 9.3 2.3 13.2L24 34.7l-11.8 6.2 2.3-13.2-9.6-9.3 13.2-1.9L24 4.5z"
            fill="#e7b33a"
            stroke="#a86f12"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case "MIC":
      return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
          <Rect x={17} y={4} width={14} height={24} rx={7} fill="#c9ccd3" stroke="#6b6f78" strokeWidth={1.5} />
          <Path d="M18 11h12M18 15.5h12M18 20h12" stroke="#6b6f78" strokeWidth={1.5} />
          <Path d="M11 21a13 13 0 0026 0" fill="none" stroke="#e11d2e" strokeWidth={3.2} strokeLinecap="round" />
          <Path d="M24 34v7M17 42.5h14" stroke="#e11d2e" strokeWidth={3.2} strokeLinecap="round" />
        </Svg>
      );
    case "MONEY_SPRAY":
      return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
          <G rotation={-14} origin="24, 24">
            <Rect x={6} y={15} width={34} height={18} rx={2.5} fill="#2f8f57" stroke="#1d5f39" strokeWidth={1.5} />
            <Rect x={9.5} y={18.5} width={27} height={11} rx={1.5} fill="none" stroke="#7fd6a0" strokeWidth={1} />
            <Circle cx={23} cy={24} r={3.6} fill="none" stroke="#c8f2d6" strokeWidth={1.6} />
          </G>
          <G rotation={8} origin="26, 30">
            <Rect x={10} y={22} width={34} height={18} rx={2.5} fill="#3fa968" stroke="#1d5f39" strokeWidth={1.5} />
            <Rect x={13.5} y={25.5} width={27} height={11} rx={1.5} fill="none" stroke="#8fe2ae" strokeWidth={1} />
            <Circle cx={27} cy={31} r={3.6} fill="none" stroke="#d9f7e3" strokeWidth={1.6} />
          </G>
        </Svg>
      );
    case "GRAMMY":
      return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
          <Path d="M11 5h26c0 11-4.5 18.5-13 19.5C15.5 23.5 11 16 11 5z" fill="#e7b33a" stroke="#8a5a0c" strokeWidth={1.6} strokeLinejoin="round" />
          <Path d="M15.5 8c.6 6 2.8 10.5 6.5 12.4" fill="none" stroke="#fbe3a1" strokeWidth={1.8} strokeLinecap="round" />
          <Path d="M21 24.5h6l-1 7h-4l-1-7z" fill="#d49b2a" stroke="#8a5a0c" strokeWidth={1.4} strokeLinejoin="round" />
          <Ellipse cx={24} cy={33} rx={7} ry={2.4} fill="#e7b33a" stroke="#8a5a0c" strokeWidth={1.4} />
          <Rect x={13} y={36} width={22} height={7} rx={2} fill="#d49b2a" stroke="#8a5a0c" strokeWidth={1.6} />
        </Svg>
      );
  }
}
