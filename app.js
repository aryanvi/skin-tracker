// The screens: Today (day strip, streak, tiles, capture) and Calendar,
// plus the review and photo viewer pop-ups.

let startDate; // the first day the app was used, e.g. "2026-10-29"
let days = new Map(); // "2026-10-29" -> that day's photos, oldest first: [{ id, date, photo, takenAt, url }]
let calendarView = loadCalendarView(); // "photos" or "lines"
let calendarRange = "month"; // "month" (default) or "all"
let shownMonth = null; // in "month" mode: { year, month }, starts at this month
let pendingPhoto = null; // a photo taken but not saved yet: { blob, url }

const $ = (id) => document.getElementById(id);

// ---------- Start up ----------

async function init() {
  startDate = await getMeta("startDate");
  if (!startDate) {
    startDate = todayKey();
    await setMeta("startDate", startDate);
  }

  for (const photo of await getAllPhotos()) addToDays(photo);

  // Ask the browser not to clear our data when space runs low
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist();
  }

  showScreen();
  render();
}

function addToDays(photo) {
  photo.url = URL.createObjectURL(photo.photo);
  const list = days.get(photo.date) || [];
  list.push(photo);
  list.sort((a, b) => a.takenAt - b.takenAt);
  days.set(photo.date, list);
}

// ---------- Screens ----------

// The address decides the screen: …/#calendar shows the calendar,
// anything else shows Today. This makes the phone's back gesture work.
function showScreen() {
  const name = location.hash === "#calendar" ? "calendar" : "today";
  for (const screen of document.querySelectorAll(".screen")) {
    screen.hidden = screen.id !== `screen-${name}`;
  }
  for (const tab of document.querySelectorAll(".tab")) {
    if (tab.dataset.screen === name) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  $("tabbar").dataset.active = name; // slides the white pill
  // Opening the calendar always starts on this month
  if (name === "calendar") {
    calendarRange = "month";
    shownMonth = null;
    if (startDate) renderCalendar();
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", showScreen);

function render() {
  const today = todayKey();
  $("today-label").textContent = fromKey(today).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  $("camera-label").textContent = days.has(today) ? "Add another photo" : "Log a breakout";
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
    const breakout = days.has(key);
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
  const { current, best } = computeStreaks(startDate, days);
  const now = fromKey(today);
  const month = monthCounts(now.getFullYear(), now.getMonth(), startDate, days);

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

// All camera inputs (Today button, nav button and Retake) work the same way
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

// Save adds the photo to today. Earlier photos from today are kept.
$("review-save").addEventListener("click", async () => {
  if (!pendingPhoto) return;
  const photo = { date: todayKey(), photo: pendingPhoto.blob, takenAt: Date.now() };
  photo.id = await addPhoto(photo);
  URL.revokeObjectURL(pendingPhoto.url);
  pendingPhoto = null;
  addToDays(photo);

  $("review").close();
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

// One month with arrows, or every month since tracking started (newest at the top)
function renderCalendar() {
  const today = todayKey();
  const now = fromKey(today);
  const start = fromKey(startDate);

  $("since-label").textContent =
    "Since " + start.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  for (const tab of document.querySelectorAll("[data-view]")) {
    tab.setAttribute("aria-selected", tab.dataset.view === calendarView);
  }
  $("range").value = calendarRange;
  $("range-label").textContent = calendarRange === "month" ? "Month" : "All months";

  $("legend").innerHTML =
    calendarView === "photos"
      ? `<span><i class="key clear"></i>Clear</span><span><i class="key breakout"></i>Breakout</span><span><i class="key none"></i>Not tracked</span>`
      : `<span><i class="key line"></i>Breakout</span>`;

  const months = $("months");
  months.className = calendarView;
  months.innerHTML = "";

  if (calendarRange === "month") {
    if (!shownMonth) shownMonth = { year: now.getFullYear(), month: now.getMonth() };
    months.appendChild(renderMonth(shownMonth.year, shownMonth.month, today, true));
    return;
  }

  let year = now.getFullYear();
  let month = now.getMonth();
  while (year > start.getFullYear() || (year === start.getFullYear() && month >= start.getMonth())) {
    months.appendChild(renderMonth(year, month, today));
    month--;
    if (month < 0) {
      month = 11;
      year--;
    }
  }
}

function renderMonth(year, month, today, withArrows = false) {
  const section = document.createElement("section");
  section.className = "month";

  const counts = monthCounts(year, month, startDate, days, today);
  const title = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const summary = `${counts.breakouts} breakout${counts.breakouts === 1 ? "" : "s"} · ${counts.clear} clear`;
  const head = withArrows
    ? `<div class="month-head toolbar">
        <div><h2>${title}</h2><span class="micro">${summary}</span></div>
        <div class="toolbar-actions">
          <button class="ghost to-today">Today</button>
          <button class="nav prev" aria-label="Previous month">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
          </button>
          <button class="nav next" aria-label="Next month">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>`
    : `<div class="month-head"><h2>${title}</h2><span class="micro">${summary}</span></div>`;
  section.innerHTML = `
    ${head}
    <div class="cal-grid weekdays micro" aria-hidden="true">
      <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
    </div>`;

  const grid = document.createElement("div");
  grid.className = "cal-grid";

  // Empty boxes before the 1st, so it lands under the right weekday (Monday first)
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  for (let i = 0; i < firstWeekday; i++) {
    grid.appendChild(document.createElement("span"));
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const key = toKey(new Date(year, month, day));
    const weekday = (firstWeekday + day - 1) % 7; // 0 = Monday, 6 = Sunday
    const cell = document.createElement("button");
    cell.className = "day";
    cell.textContent = day;

    if (key < startDate || key > today) {
      cell.classList.add("none");
      cell.disabled = true;
      cell.setAttribute("aria-label", `${day}: not tracked`);
    } else if (days.has(key)) {
      const photos = days.get(key);
      cell.classList.add("breakout");
      if (calendarView === "photos") {
        cell.style.backgroundImage = `url(${photos[photos.length - 1].url})`; // latest photo
        if (photos.length > 1) {
          const count = document.createElement("span");
          count.className = "count";
          count.textContent = photos.length;
          cell.appendChild(count);
        }
      } else {
        // Join the line to breakout days next to it in the same week row
        if (weekday > 0 && day > 1 && days.has(addDays(key, -1))) cell.classList.add("join-left");
        if (weekday < 6 && day < daysInMonth && days.has(addDays(key, 1))) cell.classList.add("join-right");
      }
      const label = photos.length === 1 ? "1 photo" : `${photos.length} photos`;
      cell.setAttribute("aria-label", `${day}: breakout, ${label}`);
      cell.addEventListener("click", () => openViewer(key));
    } else {
      cell.classList.add("clear");
      cell.disabled = true;
      cell.setAttribute("aria-label", `${day}: clear`);
    }
    if (key === today) cell.classList.add("today");

    grid.appendChild(cell);
  }

  section.appendChild(grid);

  if (withArrows) {
    // Don't go before the month tracking started or past this month
    const monthKey = toKey(new Date(year, month, 1)).slice(0, 7);
    const prev = section.querySelector(".prev");
    const next = section.querySelector(".next");
    const toToday = section.querySelector(".to-today");
    prev.disabled = monthKey <= startDate.slice(0, 7);
    next.disabled = monthKey >= today.slice(0, 7);
    toToday.disabled = monthKey === today.slice(0, 7);
    prev.addEventListener("click", () => moveMonth(-1));
    next.addEventListener("click", () => moveMonth(1));
    toToday.addEventListener("click", () => {
      shownMonth = null; // back to this month
      renderCalendar();
    });
  }

  return section;
}

function moveMonth(step) {
  const d = new Date(shownMonth.year, shownMonth.month + step, 1);
  shownMonth = { year: d.getFullYear(), month: d.getMonth() };
  renderCalendar();
}

// Month / All months picker. Not remembered: the calendar always opens on one month.
$("range").addEventListener("change", () => {
  calendarRange = $("range").value;
  renderCalendar();
});

// Photos | Lines switch. The choice is remembered on this phone.
for (const button of document.querySelectorAll("[data-view]")) {
  button.addEventListener("click", () => {
    calendarView = button.dataset.view;
    try {
      localStorage.setItem("calendarView", calendarView);
    } catch {}
    renderCalendar();
  });
}

function loadCalendarView() {
  try {
    return localStorage.getItem("calendarView") === "lines" ? "lines" : "photos";
  } catch {
    return "photos";
  }
}

// ---------- Photo viewer ----------

let viewerDate = null;
let viewerIndex = 0; // which of the day's photos is showing

// Opens a day's photos, starting with the latest
function openViewer(date) {
  viewerDate = date;
  viewerIndex = days.get(date).length - 1;
  showViewerPhoto();
  $("viewer").showModal();
}

function showViewerPhoto() {
  const photos = days.get(viewerDate);
  const photo = photos[viewerIndex];
  const d = fromKey(viewerDate);
  const time = new Date(photo.takenAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  $("viewer-day").textContent = d.getDate();
  $("viewer-month").textContent =
    d.toLocaleDateString(undefined, { weekday: "short" }) + " · " +
    d.toLocaleDateString(undefined, { month: "long", year: "numeric" }) + " · " + time;
  $("viewer-photo").src = photo.url;

  $("viewer-pager").hidden = photos.length < 2;
  $("viewer-count").textContent = `${viewerIndex + 1} of ${photos.length}`;
  $("viewer-prev").disabled = viewerIndex === 0;
  $("viewer-next").disabled = viewerIndex === photos.length - 1;
  disarmDelete();
}

$("viewer-prev").addEventListener("click", () => {
  viewerIndex--;
  showViewerPhoto();
});

$("viewer-next").addEventListener("click", () => {
  viewerIndex++;
  showViewerPhoto();
});

function disarmDelete() {
  $("viewer-delete").textContent = "Delete";
  $("viewer-delete").classList.remove("armed");
}

$("viewer-close").addEventListener("click", () => $("viewer").close());

// Delete needs two taps, so a photo isn't removed by accident.
// It removes only the photo showing; the day's other photos stay.
$("viewer-delete").addEventListener("click", async () => {
  const button = $("viewer-delete");
  if (!button.classList.contains("armed")) {
    button.textContent = "Tap again to delete";
    button.classList.add("armed");
    return;
  }
  const photos = days.get(viewerDate);
  await deletePhoto(photos[viewerIndex].id);
  const [removed] = photos.splice(viewerIndex, 1);
  URL.revokeObjectURL(removed.url);

  if (photos.length === 0) {
    days.delete(viewerDate);
    $("viewer").close();
  } else {
    viewerIndex = Math.min(viewerIndex, photos.length - 1);
    showViewerPhoto();
  }
  render();
});

// If the app stays open past midnight, refresh when you come back to it
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) render();
});

init();
