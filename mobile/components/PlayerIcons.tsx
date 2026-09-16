import { Svg, Path, Rect } from "react-native-svg";

// Same shapes as web's play/pause glyphs (PurchaseAndPlayer.tsx etc.) —
// solid filled vectors rather than Unicode symbols (⏮⏸⏭), which render as
// a missing-glyph box on some Android fonts instead of an actual icon.
type IconProps = { color: string; size?: number };

export function PlayIcon({ color, size = 14 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M8 5v14l11-7z" />
    </Svg>
  );
}

export function PauseIcon({ color, size = 14 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Rect x={6} y={5} width={4} height={14} />
      <Rect x={14} y={5} width={4} height={14} />
    </Svg>
  );
}

export function SkipNextIcon({ color, size = 16 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M6 6l8.5 6L6 18V6z" />
      <Rect x={16} y={6} width={2.5} height={12} />
    </Svg>
  );
}

export function SkipPreviousIcon({ color, size = 16 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Rect x={5.5} y={6} width={2.5} height={12} />
      <Path d="M18 6v12l-8.5-6L18 6z" />
    </Svg>
  );
}
