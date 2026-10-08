// Hands a battle invite to the ringing screen (components/live/BattleInviteRing.tsx)
// from wherever it shows up — the in-app message poll, or a tapped push
// (lib/messageNotify.ts). Either the full invite, or just its id to load.

export type BattleInviteSignal = { inviteId: string; invite?: unknown };

const listeners = new Set<(signal: BattleInviteSignal) => void>();

export function ringBattleInvite(signal: BattleInviteSignal) {
  listeners.forEach((fn) => fn(signal));
}

export function onBattleInvite(fn: (signal: BattleInviteSignal) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
