"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { BackHeader } from "@/components/ui/BackHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { BattleScoreboard, type Battle } from "@/components/live/battle";

// A Live battle's recorded result (explicit ask, 2026-10-08: "it should be
// recorded") — places, score, gifts, votes, prizes, supporters and every
// turn's time. Read once; a finished battle never changes.
export default function BattleResultPage() {
  const params = useParams<{ battleId: string }>();
  const { loading: authLoading } = useAuth();
  const [battle, setBattle] = useState<Battle | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    apiFetch(`/api/live/battles/${params.battleId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (!data?.battle) return setState("missing");
        setBattle(data.battle);
        setState("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, params.battleId]);

  return (
    <div className="pb-10">
      <BackHeader title="Battle result" />
      <div className="px-4">
        {state === "loading" && <LoadingSpinner full size="md" />}
        {state === "missing" && <p className="py-16 text-center text-ink-3">This battle doesn&apos;t exist.</p>}
        {battle && (
          <>
            <h1 className="font-serif text-[28px] leading-tight">{battle.title}</h1>
            <p className="mb-1 text-[13px] text-ink-3">
              Hosted by{" "}
              <Link href={`/u/${battle.host.handle}`} className="text-ink-2">
                {battle.host.displayName}
              </Link>{" "}
              in{" "}
              <Link href={`/live/${battle.liveSessionId}`} className="text-ink-2">
                {battle.liveTitle}
              </Link>
            </p>
            <p className="mb-5 text-[13px] text-ink-3">
              {battle.status === "FINISHED" && battle.finishedAt
                ? `Finished ${new Date(battle.finishedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
                : battle.status === "CANCELLED"
                  ? "Cancelled"
                  : "Still going — open the Live to watch"}
              {` · ${battle.rounds} round${battle.rounds === 1 ? "" : "s"}`}
              {battle.prizeXg > 0 ? ` · ${battle.prizeXg.toLocaleString("en-NG")} XG prize` : ""}
            </p>
            <BattleScoreboard battle={battle} />
          </>
        )}
      </div>
    </div>
  );
}
