// Date helpers and the streak maths.
// Days are stored as text like "2026-10-29", which sorts in date order.

function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(key, n) {
  const date = fromKey(key);
  date.setDate(date.getDate() + n);
  return toKey(date);
}

function todayKey() {
  return toKey(new Date());
}

// Walk every day from the start until today.
// A day with a photo is a breakout day and resets the streak.
// A day without a photo is a clear day and adds 1 to it.
function computeStreaks(startKey, breakoutDays, today = todayKey()) {
  let current = 0;
  let best = 0;
  for (let key = startKey; key <= today; key = addDays(key, 1)) {
    if (breakoutDays.has(key)) {
      current = 0;
    } else {
      current++;
      best = Math.max(best, current);
    }
  }
  return { current, best };
}

// The last n days, oldest first, ending today. Used for the day strip.
function lastDays(n, today = todayKey()) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) days.push(addDays(today, -i));
  return days;
}

// The first day the Today strip shows: the 1st of this month, or the 1st of
// last month during the first week, so there's always more than a week to swipe.
function stripStart(today = todayKey()) {
  const date = fromKey(today);
  const monthsBack = date.getDate() <= 7 ? 1 : 0;
  return toKey(new Date(date.getFullYear(), date.getMonth() - monthsBack, 1));
}

// Clear and breakout days in one month, counting only tracked days
// (from the start date up to today). month is 0 for January.
function monthCounts(year, month, startKey, breakoutDays, today = todayKey()) {
  let clear = 0;
  let breakouts = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const key = toKey(new Date(year, month, day));
    if (key < startKey || key > today) continue;
    if (breakoutDays.has(key)) breakouts++;
    else clear++;
  }
  return { clear, breakouts };
}

// Lets Node load this file for testing. Browsers ignore it.
if (typeof module !== "undefined") {
  module.exports = { toKey, fromKey, addDays, todayKey, computeStreaks, lastDays, stripStart, monthCounts };
}
