const SIZES = { sm: "h-6 w-6", md: "h-9 w-9", lg: "h-14 w-14" } as const;

export function LoadingSpinner({ size = "md", full = false }: { size?: keyof typeof SIZES; full?: boolean }) {
  const spinner = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/xoldout-icon.jpeg" alt="" className={`${SIZES[size]} rounded-md animate-spin`} />
  );

  if (!full) return spinner;

  return <div className="flex flex-1 items-center justify-center py-16">{spinner}</div>;
}
