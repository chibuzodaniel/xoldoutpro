import Link from "next/link";
import { FallbackImg } from "@/components/ui/FallbackImg";

export type GroupCardData = {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  visibility: "OPEN" | "REQUEST_TO_JOIN";
  creator: { displayName: string; handle: string };
  memberCount: number;
  myRole: "ADMIN" | "MEMBER" | null;
};

// Card, not a list row — matches Collections/Discover's tile language.
export function GroupCard({ group }: { group: GroupCardData }) {
  return (
    <Link href={`/groups/${group.id}`} className="block w-full">
      <div className="aspect-square w-full rounded-lg bg-surface-2 overflow-hidden relative">
        <FallbackImg src={group.coverImageUrl} alt={group.name} className="h-full w-full object-cover" fallback={null} />
        {group.visibility === "REQUEST_TO_JOIN" && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 backdrop-blur-sm px-2 py-[3px] text-[10px] font-semibold uppercase tracking-wide text-white flex items-center gap-1">
            <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 118 0v3" />
            </svg>
            Private
          </span>
        )}
        {group.myRole === "ADMIN" && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-red px-2 py-[3px] text-[10px] font-semibold uppercase tracking-wide text-white">
            Admin
          </span>
        )}
      </div>
      <p className="text-xs font-semibold mt-1.5 line-clamp-1">{group.name}</p>
      <p className="text-[12px] text-ink-3 line-clamp-1">
        {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
      </p>
    </Link>
  );
}
