"use client";

type Props = {
  title: string;
  onView: () => void;
  onUpload: () => void;
  onClose: () => void;
};

export function PhotoActionSheet({ title, onView, onUpload, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="relative w-full rounded-t-2xl border-t border-line-soft bg-surface p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">{title}</p>
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-3">
          <button type="button" onClick={onView} className="py-3.5 text-sm font-semibold text-center text-ink">
            View photo
          </button>
          <button type="button" onClick={onUpload} className="py-3.5 text-sm font-semibold text-center text-red-soft">
            Upload new photo
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg border border-line py-3 text-sm font-semibold text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
