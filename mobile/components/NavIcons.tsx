import { Svg, Circle, Path } from "react-native-svg";

// Ported line-for-line from web's components/nav/BottomNav.tsx ICONS map —
// same viewBox/paths, just JSX-cased for react-native-svg.
type IconProps = { color: string; size?: number };

export function DiscoverIcon({ color, size = 19 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" strokeLinejoin="round" />
    </Svg>
  );
}

export function SocialsIcon({ color, size = 19 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6}>
      <Circle cx={9} cy={8} r={3.2} />
      <Path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5" />
      <Path d="M17 8.5a3 3 0 010 5" strokeLinecap="round" />
    </Svg>
  );
}

export function LibraryIcon({ color, size = 19 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6}>
      <Path d="M4 6h9M4 11h9M4 16h5" strokeLinecap="round" />
      <Circle cx={18} cy={15.5} r={2.6} />
      <Path d="M20.6 15.5V7" strokeLinecap="round" />
    </Svg>
  );
}

export function ProfileIcon({ color, size = 19 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6}>
      <Circle cx={12} cy={8.5} r={3.5} />
      <Path d="M4.5 20a7.5 7.5 0 0115 0" strokeLinecap="round" />
    </Svg>
  );
}

export function PlusIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2}>
      <Path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </Svg>
  );
}

// Ported from web's BottomNav.tsx "Post" FAB glyph — a pencil, swapped in
// for PlusIcon when the raised Drop button is composing a post instead of
// opening the general Publish hub.
export function ComposeIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
      <Path
        d="M4 20l.9-4.5a2 2 0 01.55-1.03L16.6 3.32a1.6 1.6 0 012.26 0l1.82 1.82a1.6 1.6 0 010 2.26L9.53 18.55a2 2 0 01-1.03.55L4 20z"
        strokeLinejoin="round"
      />
      <Path d="M14.5 5.5l4 4" strokeLinecap="round" />
    </Svg>
  );
}

export function BellIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
      <Path d="M18 8a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10 20a2 2 0 004 0" strokeLinecap="round" />
    </Svg>
  );
}
