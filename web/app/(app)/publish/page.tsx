import { PublishOptionsList } from "@/components/publish/PublishOptionsList";

export default function PublishSheetPage() {
  return (
    <div className="px-4 py-6">
      <h1 className="font-serif text-2xl mb-6">What are you publishing?</h1>
      <PublishOptionsList />
    </div>
  );
}
