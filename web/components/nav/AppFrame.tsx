// The app shell's column. Full width on every screen (explicit ask,
// 2026-11-09: "full screen on the desktop as the old version") — wide-screen
// layouts are handled per screen instead (feed grids, two-column product
// pages, wider product grids), so nothing is squeezed into a phone column.
export function AppFrame({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full w-full flex-col">{children}</div>;
}
