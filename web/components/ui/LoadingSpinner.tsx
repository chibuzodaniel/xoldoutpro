const SIZES = { sm: "h-6 w-6", md: "h-9 w-9", lg: "h-14 w-14" } as const;

export function LoadingSpinner({ size = "md", full = false }: { size?: keyof typeof SIZES; full?: boolean }) {
  const spinner = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/xoldout-icon-transparent.png" alt="" className={`${SIZES[size]} animate-spin-breathe`} />
  );

  if (!full) return spinner;

  // Fixed against the real viewport, not sized/centered relative to
  // whatever ancestor box happens to contain it. An in-flow box (flex-1,
  // min-h-[Xvh], etc.) only centers correctly when every ancestor between it
  // and a sized flex container cooperates — most `full` call sites nest this
  // several plain block divs deep (page padding, conditional branches) with
  // no such chain, so the box ends up shorter than the actual visible area
  // and top-anchored, biasing the spinner upward instead of centering it.
  // `fixed inset-0` sidesteps that entirely: it's always the true viewport,
  // regardless of what contains it. No backdrop and pointer-events-none so
  // it never blocks whatever chrome (headers, tabs) is already rendered
  // above/around it.
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
      {spinner}
    </div>
  );
}
