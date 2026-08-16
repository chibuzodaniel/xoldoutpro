const SIZES = { sm: "h-6 w-6", md: "h-9 w-9", lg: "h-14 w-14" } as const;

// flex-1 alone only centers when the parent is itself a flex container with
// real height to give it (true for the root auth-gate loading state, not for
// a spinner dropped into a plain block div mid-page, which most `full` call
// sites are) — an explicit min-height guarantees room to actually center in
// either case, not just sit top-left after its padding. Scaled to size: sm
// is used for a compact inline section loader (e.g. one list among several
// already-rendered on the page), md/lg for a page's primary content not
// being ready yet, which reads better centered in the visible viewport.
const MIN_HEIGHT = { sm: "min-h-24", md: "min-h-[60vh]", lg: "min-h-[70vh]" } as const;

export function LoadingSpinner({ size = "md", full = false }: { size?: keyof typeof SIZES; full?: boolean }) {
  const spinner = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/xoldout-icon-transparent.png" alt="" className={`${SIZES[size]} animate-spin`} />
  );

  if (!full) return spinner;

  return <div className={`flex flex-1 ${MIN_HEIGHT[size]} items-center justify-center py-16`}>{spinner}</div>;
}
