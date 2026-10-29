// The screen: day strip, streak, tiles, capture, calendar and photo viewer.

let startDate; // the first day the app was used, e.g. "2026-10-29"
let entries = new Map(); // "2026-10-29" -> { date, photo, takenAt, url }
let shownMonth = new Date(); // which month the calendar is showing
let pendingPhoto = null; // a photo taken but not saved yet: { blob, url }

const $ = (id) => document.getElementById(id);

// ---------- Start up ----------

async function init() {
  startDate = await getMeta("startDate");
  if (!startDate) {
    startDate = todayKey();
    await setMeta("startDate", startDate);
  }

  for (const entry of await getAllEntries()) {
    entry.url = URL.createObjectURL(entry.photo);
    entries.set(entry.date, entry);
  }

  // Ask the browser not to clear our data when space runs low
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist();
  }

  render();
}

function render() {
  const today = todayKey();
  $("today-label").textContent = fromKey(today).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  $("camera-label").textContent = entries.has(today) ? "Retake today's photo" : "Log a breakout";
  renderDayStrip();
  renderStreak();
  renderCalendar();
}

// ---------- Day strip ----------

function renderDayStrip() {
  const today = todayKey();
  const strip = $("day-strip");
  strip.innerHTML = "";

  for (const key of lastDays(7, today)) {
    const date = fromKey(key);
    const li = document.createElement("li");
    const tracked = key >= startDate;
    const breakout = entries.has(key);
    if (key === today) li.classList.add("today");
    if (!tracked) li.classList.add("untracked");

    const status = !tracked ? "not tracked" : breakout ? "breakout" : "clear";
    li.setAttribute("aria-label", `${date.toLocaleDateString(undefined, { weekday: "long", day: "numeric" })}: ${status}`);
    li.innerHTML = `
      <span class="weekday">${date.toLocaleDateString(undefined, { weekday: "short" })}</span>
      <span class="num">${date.getDate()}</span>
      <span class="mark ${tracked ? (breakout ? "breakout" : "clear") : ""}"></span>`;
    strip.appendChild(li);
  }
}

// ---------- Streak and tiles ----------

function renderStreak() {
  const today = todayKey();
  const { current, best } = computeStreaks(startDate, entries);
  const now = fromKey(today);
  const month = monthCounts(now.getFullYear(), now.getMonth(), startDate, entries);

  $("streak-number").textContent = current;
  $("streak-label").textContent =
    current === 0
      ? "Breakout logged today. A fresh streak starts tomorrow."
      : current === 1
        ? "day clear"
        : "days clear";
  $("tile-best").textContent = best;
  $("tile-clear").textContent = month.clear;
  $("tile-breakouts").textContent = month.breakouts;
}

// ---------- Taking a photo: review first, then save ----------

// Both camera inputs (main button and Retake) work the same way
for (const input of document.querySelectorAll(".camera-input")) {
  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = ""; // so picking the same file again still works
    if (!file) return;

    const blob = await shrinkPhoto(file);
    discardPending();
    pendingPhoto = { blob, url: URL.createObjectURL(blob) };

    $("review-date").textContent = fromKey(todayKey()).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    $("review-photo").src = pendingPhoto.url;
    if (!$("review").open) $("review").showModal();
  });
}

$("review-save").addEventListener("click", async () => {
  if (!pendingPhoto) return;
  const date = todayKey();
  const entry = { date, photo: pendingPhoto.blob, takenAt: Date.now() };
  await saveEntry(entry);

  const old = entries.get(date);
  if (old) URL.revokeObjectURL(old.url);
  entry.url = pendingPhoto.url; // the saved entry now owns this URL
  entries.set(date, entry);
  pendingPhoto = null;

  $("review").close();
  shownMonth = new Date();
  render();
});

$("review-cancel").addEventListener("click", () => $("review").close());

// Closing the review without saving (Cancel or swipe/Escape) throws the photo away
$("review").addEventListener("close", discardPending);

function discardPending() {
  if (!pendingPhoto) return;
  URL.revokeObjectURL(pendingPhoto.url);
  pendingPhoto = null;
}

// Phone photos are huge (several MB). Shrink them so thousands fit on the phone.
function shrinkPhoto(file, maxSize = 1200) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not process photo"))),
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read photo"));
    };
    img.src = url;
  });
}

// ---------- Calendar ----------

function renderCalendar() {
  const year = shownMonth.getFullYear();
  const month = shownMonth.getMonth();
  const today = todayKey();

  $("month-title").textContent = shownMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const grid = $("calendar");
  grid.innerHTML = "";

  // Empty boxes before the 1st, so it lands under the right weekday (Monday first)
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  for (let i = 0; i < firstWeekday; i++) {
    grid.appendChild(document.createElement("span"));
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const key = toKey(new Date(year, month, day));
    const cell = document.createElement("button");
    cell.className = "day";
    cell.textContent = day;

    if (key < startDate || key > today) {
      cell.classList.add("none");
      cell.disabled = true;
      cell.setAttribute("aria-label", `${day}: not tracked`);
    } else if (entries.has(key)) {
      cell.classList.add("breakout");
      cell.style.backgroundImage = `url(${entries.get(key).url})`;
      cell.setAttribute("aria-label", `${day}: breakout, view photo`);
      cell.addEventListener("click", () => openViewer(key));
    } else {
      cell.classList.add("clear");
      cell.disabled = true;
      cell.setAttribute("aria-label", `${day}: clear`);
    }
    if (key === today) cell.classList.add("today");

    grid.appendChild(cell);
  }

  // Don't let the calendar go before the start month or past this month
  const monthKey = toKey(new Date(year, month, 1)).slice(0, 7);
  $("prev-month").disabled = monthKey <= startDate.slice(0, 7);
  $("next-month").disabled = monthKey >= today.slice(0, 7);
}

$("prev-month").addEventListener("click", () => {
  shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() - 1, 1);
  renderCalendar();
});

$("next-month").addEventListener("click", () => {
  shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 1);
  renderCalendar();
});

// ---------- Photo viewer ----------

let viewerDate = null;

function openViewer(date) {
  viewerDate = date;
  const d = fromKey(date);
  $("viewer-day").textContent = d.getDate();
  $("viewer-month").textContent =
    d.toLocaleDateString(undefined, { weekday: "short" }) + " · " +
    d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  $("viewer-photo").src = entries.get(date).url;
  disarmDelete();
  $("viewer").showModal();
}

function disarmDelete() {
  $("viewer-delete").textContent = "Delete";
  $("viewer-delete").classList.remove("armed");
}

$("viewer-close").addEventListener("click", () => $("viewer").close());

// Delete needs two taps, so a photo isn't removed by accident
$("viewer-delete").addEventListener("click", async () => {
  const button = $("viewer-delete");
  if (!button.classList.contains("armed")) {
    button.textContent = "Tap again to delete";
    button.classList.add("armed");
    return;
  }
  await deleteEntry(viewerDate);
  URL.revokeObjectURL(entries.get(viewerDate).url);
  entries.delete(viewerDate);
  $("viewer").close();
  render();
});

// If the app stays open past midnight, refresh when you come back to it
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) render();
});

init();
