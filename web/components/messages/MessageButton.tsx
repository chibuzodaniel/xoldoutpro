"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";

// The Message button on someone's profile (direct messages, explicit ask
// 2026-10-04): opens the existing conversation, or a new one.
export function MessageButton({ targetUserId }: { targetUserId: string }) {
  const { appUser } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (!appUser || appUser.id === targetUserId) return null;

  async function open() {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/messages/with/${targetUserId}`);
      if (!res.ok) throw new Error();
      const data: { conversationId: string | null; blockedMe: boolean } = await res.json();
      if (data.blockedMe) {
        toast.error("You can't message this person.");
        return;
      }
      router.push(data.conversationId ? `/messages/${data.conversationId}` : `/messages/new?to=${targetUserId}`);
    } catch {
      toast.error("Couldn't open messages. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="rounded-lg border border-line px-4 py-1.5 text-xs font-semibold text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink disabled:opacity-50"
    >
      Message
    </button>
  );
}
