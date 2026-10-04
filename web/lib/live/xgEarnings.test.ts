import { describe, it, expect } from "vitest";
import { xgHoldCutoff } from "./xgEarnings";

// XG received at or before the cutoff has finished its hold and is paid out
// on the next daily run.
describe("XG payout hold cutoff", () => {
  const now = new Date("2026-10-15T00:15:00Z");

  it("holds XG for the configured number of days", () => {
    expect(xgHoldCutoff(now, 7).toISOString()).toBe("2026-10-08T00:15:00.000Z");
    expect(xgHoldCutoff(now, 30).toISOString()).toBe("2026-09-15T00:15:00.000Z");
  });

  it("pays everything received so far when the hold is 0", () => {
    expect(xgHoldCutoff(now, 0).toISOString()).toBe(now.toISOString());
  });
});
