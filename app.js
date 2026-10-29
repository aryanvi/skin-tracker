// The screen: streak, camera button, calendar and photo viewer.

let startDate; // the first day the app was used, e.g. "2026-10-29"
let entries = new Map(); // "2026-10-29" -> { date, photo, takenAt, url }
let shownMonth = new Date(); // which month the calendar is showing

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
  renderStreak();
  renderCalendar();
  $("camera-label").textContent = entries.has(todayKey())
    ? "Retake today's photo"
    : "I have a breakout today";
}

// ---------- Streak ----------

function renderStreak() {
  const { current, best } = computeStreaks(startDate, entries);
  $("streak-number").textContent = current;
  $("streak-label").textContent =
    current === 0
      ? "Breakout logged today. A new streak starts tomorrow 💪"
      : `clear ${current === 1 ? "day" : "days"} in a row 🔥`;
  $("streak-best").textContent = `Best: ${best} ${best === 1 ? "day" : "days"}`;
}

// ---------- Taking a photo ----------

$("camera").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = ""; // so picking the same file again still works
  if (!file) return;

  const date = todayKey();
  const photo = await shrinkPhoto(file);
  const entry = { date, photo, takenAt: Date.now() };
  await saveEntry(entry);

  const old = entries.get(date);
  if (old) URL.revokeObjectURL(old.url);
  entry.url = URL.createObjectURL(photo);
  entries.set(date, entry);

  shownMonth = new Date();
  render();
  openViewer(date);
});

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
    } else if (entries.has(key)) {
      cell.classList.add("breakout");
      cell.style.backgroundImage = `url(${entries.get(key).url})`;
      cell.addEventListener("click", () => openViewer(key));
    } else {
      cell.classList.add("clear");
      cell.disabled = true;
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
  $("viewer-title").textContent = fromKey(date).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  $("viewer-photo").src = entries.get(date).url;
  $("viewer-delete").textContent = "Delete";
  $("viewer").showModal();
}

$("viewer-close").addEventListener("click", () => $("viewer").close());

// Delete needs two taps, so a photo isn't removed by accident
$("viewer-delete").addEventListener("click", async () => {
  const button = $("viewer-delete");
  if (button.textContent === "Delete") {
    button.textContent = "Tap again to delete";
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
