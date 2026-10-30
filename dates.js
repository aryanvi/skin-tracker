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
// A breakout day resets the streak; a clear day adds 1 to it.
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

// Which days count as breakouts: a day with a photo, unless it was marked
// clear. A day without a photo is always clear.
// photoDates: dates that have photos; dayInfo: Map date -> { status, tags }
function breakoutDays(photoDates, dayInfo = new Map()) {
  const set = new Set();
  for (const date of photoDates) {
    const info = dayInfo.get(date);
    if (!info || info.status !== "clear") set.add(date);
  }
  return set;
}

// The most recent breakout day up to today, or null if there's never been one
function lastBreakout(breakouts, today = todayKey()) {
  let latest = null;
  for (const date of breakouts) {
    if (date <= today && (!latest || date > latest)) latest = date;
  }
  return latest;
}

// For each tag: on how many days it was used, and on how many of those days
// a breakout happened that day or within the next `windowDays` days.
// Most-used first. Plain counts, no scores.
function tagStats(dayInfo, breakouts, windowDays = 2) {
  const stats = new Map();
  for (const [date, info] of dayInfo) {
    for (const tag of info.tags || []) {
      const row = stats.get(tag) || { tag, days: 0, followed: 0 };
      row.days++;
      for (let i = 0; i <= windowDays; i++) {
        if (breakouts.has(addDays(date, i))) {
          row.followed++;
          break;
        }
      }
      stats.set(tag, row);
    }
  }
  return [...stats.values()].sort((a, b) => b.days - a.days || a.tag.localeCompare(b.tag));
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
  module.exports = { toKey, fromKey, addDays, todayKey, computeStreaks, lastDays, stripStart, monthCounts, breakoutDays, lastBreakout, tagStats };
}
