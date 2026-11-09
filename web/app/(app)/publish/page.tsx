import { PublishOptionsList } from "@/components/publish/PublishOptionsList";

export default function PublishSheetPage() {
  return (
    <div className="px-4 py-6">
      <h1 className="font-serif text-[44px] font-bold leading-none">Drop</h1>
      <p className="mt-2 mb-5 text-[15px] text-ink-3">What are you dropping today?</p>
      <PublishOptionsList />
    </div>
  );
}
