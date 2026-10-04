import { describe, it, expect } from "vitest";
import { lagosMonthStart, nextXgPayoutDate } from "./xgEarnings";

// Lagos is UTC+1 with no DST, so the month boundary is 23:00 UTC on the
// last day of the previous month — the one place an off-by-one would pay
// creators a day early or late.
describe("Lagos month boundaries", () => {
  it("starts the month at 23:00 UTC on the previous day", () => {
    expect(lagosMonthStart(new Date("2026-10-15T12:00:00Z")).toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(nextXgPayoutDate(new Date("2026-10-15T12:00:00Z")).toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("treats 23:30 UTC on Oct 31 as already November in Lagos", () => {
    const now = new Date("2026-10-31T23:30:00Z");
    expect(lagosMonthStart(now).toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(nextXgPayoutDate(now).toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });

  it("rolls over the year in December", () => {
    expect(nextXgPayoutDate(new Date("2026-12-10T00:00:00Z")).toISOString()).toBe("2026-12-31T23:00:00.000Z");
    expect(lagosMonthStart(new Date("2027-01-01T00:00:00Z")).toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });
});
