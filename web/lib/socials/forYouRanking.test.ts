import { describe, it, expect } from "vitest";
import { scoreForYou, type ForYouSignals, type ScorablePost } from "./forYouRanking";

function emptySignals(overrides: Partial<ForYouSignals> = {}): ForYouSignals {
  return {
    likedAuthorCounts: new Map(),
    commentedAuthorCounts: new Map(),
    playCounts: new Map(),
    purchasedAuthorIds: new Set(),
    networkProximity: new Map(),
    viewerTags: new Set(),
    ...overrides,
  };
}

function post(authorId: string, hoursAgo: number, authorTags: string[] = []): ScorablePost {
  return { authorId, authorTags, createdAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000) };
}

describe("scoreForYou", () => {
  it("ranks an engaged-with creator above a stranger at the same age", () => {
    const engaged = post("engaged-creator", 5);
    const stranger = post("stranger", 5);
    const signals = emptySignals({
      likedAuthorCounts: new Map([["engaged-creator", 10]]),
      networkProximity: new Map([["engaged-creator", 3]]),
    });

    const ranked = scoreForYou([stranger, engaged], signals, []);

    expect(ranked[0].authorId).toBe("engaged-creator");
  });

  it("still surfaces a brand-new post from a zero-signal creator over a stale high-signal one", () => {
    const brandNew = post("stranger", 0.1);
    const stale = post("engaged-creator", 24 * 30); // a month old
    const signals = emptySignals({ likedAuthorCounts: new Map([["engaged-creator", 10]]) });

    const ranked = scoreForYou([stale, brandNew], signals, []);

    expect(ranked[0].authorId).toBe("stranger");
  });

  it("purchase signal isn't time-windowed the way likes/plays are — it's just present or absent", () => {
    const purchased = post("purchased-creator", 5);
    const liked = post("liked-creator", 5);
    const signals = emptySignals({
      purchasedAuthorIds: new Set(["purchased-creator"]),
      likedAuthorCounts: new Map([["liked-creator", 1]]),
    });

    const ranked = scoreForYou([liked, purchased], signals, []);

    expect(ranked[0].authorId).toBe("purchased-creator");
  });

  it("boosts a followed creator's post via the follow weight", () => {
    const followed = post("followed-creator", 5);
    const stranger = post("stranger", 5);
    const signals = emptySignals();

    const ranked = scoreForYou([stranger, followed], signals, ["followed-creator"]);

    expect(ranked[0].authorId).toBe("followed-creator");
  });

  it("gives shared-tag creators a boost over untagged strangers", () => {
    const sameTaste = post("same-taste-creator", 5, ["afrobeats"]);
    const stranger = post("stranger", 5, ["gospel"]);
    const signals = emptySignals({ viewerTags: new Set(["afrobeats"]) });

    const ranked = scoreForYou([stranger, sameTaste], signals, []);

    expect(ranked[0].authorId).toBe("same-taste-creator");
  });

  it("keeps original createdAt-desc order for exact ties", () => {
    const first = post("a", 5);
    const second = post("b", 5);
    const signals = emptySignals();

    const ranked = scoreForYou([first, second], signals, []);

    expect(ranked.map((p) => p.authorId)).toEqual(["a", "b"]);
  });
});
