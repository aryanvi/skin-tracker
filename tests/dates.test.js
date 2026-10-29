// Run with: node --test
const test = require("node:test");
const assert = require("node:assert");
const { addDays, computeStreaks, lastDays, monthCounts } = require("../dates.js");

test("first day with no photo is a 1-day streak", () => {
  assert.deepStrictEqual(computeStreaks("2026-10-29", new Set(), "2026-10-29"), { current: 1, best: 1 });
});

test("a photo today resets the streak to 0", () => {
  assert.deepStrictEqual(computeStreaks("2026-10-29", new Set(["2026-10-29"]), "2026-10-29"), { current: 0, best: 0 });
});

test("best streak survives a breakout", () => {
  // 1st–5th clear, breakout on the 6th, 7th–8th clear
  assert.deepStrictEqual(computeStreaks("2026-10-01", new Set(["2026-10-06"]), "2026-10-08"), { current: 2, best: 5 });
});

test("streak continues across a month end", () => {
  assert.deepStrictEqual(computeStreaks("2026-10-30", new Set(), "2026-11-02"), { current: 4, best: 4 });
});

test("adding days crosses a year end and a daylight-saving change", () => {
  assert.strictEqual(addDays("2026-12-31", 1), "2027-01-01");
  assert.strictEqual(addDays("2026-03-28", 2), "2026-03-30");
  assert.strictEqual(addDays("2026-10-24", 2), "2026-10-26");
});

test("lastDays gives 7 days ending today, oldest first", () => {
  assert.deepStrictEqual(lastDays(3, "2026-11-01"), ["2026-10-30", "2026-10-31", "2026-11-01"]);
  assert.strictEqual(lastDays(7, "2026-10-29").length, 7);
});

test("monthCounts only counts tracked days", () => {
  // Started on the 20th, today is the 29th: 10 tracked days, 2 breakouts
  const breakouts = new Set(["2026-10-22", "2026-10-25", "2026-09-30"]);
  assert.deepStrictEqual(monthCounts(2026, 9, "2026-10-20", breakouts, "2026-10-29"), { clear: 8, breakouts: 2 });
});

test("monthCounts is zero for a month before tracking started", () => {
  assert.deepStrictEqual(monthCounts(2026, 8, "2026-10-20", new Set(), "2026-10-29"), { clear: 0, breakouts: 0 });
});
