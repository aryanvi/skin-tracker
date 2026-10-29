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
  // The phone's back gesture shouldn't leave a photo open over another screen
  for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
  for (const screen of document.querySelectorAll(".screen")) {
    screen.hidden = screen.id !== `screen-${name}`;
  }
  for (const tab of document.querySelectorAll(".tab")) {
    if (tab.dataset.screen === name) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  placeThumb();
  // The strip can only measure itself while it's on screen
  if (name === "today" && startDate) centreDay(stripKey || todayKey(), false);
  // Opening the calendar always starts on this month
  if (name === "calendar") {
    calendarRange = "month";
    shownMonth = null;
    if (startDate) renderCalendar();
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", showScreen);

// Moves the white pill under the open screen's label and sizes it to fit
function placeThumb() {
  const bar = $("tabbar");
  const active = bar.querySelector(".tab[aria-current]");
  if (!active) return;
  bar.style.setProperty("--thumb-x", `${active.offsetLeft}px`);
  bar.style.setProperty("--thumb-w", `${active.offsetWidth}px`);
}

// Labels change width once the font loads, so measure again then.
// After that first placement, turn on the sliding animation.
document.fonts.ready.then(() => {
  placeThumb();
  requestAnimationFrame(() => $("tabbar").classList.add("ready"));
});
window.addEventListener("resize", () => {
  placeThumb();
  if (startDate) centreDay(stripKey || todayKey(), false); // e.g. after turning the phone
});

// ---------- Short messages ----------

let toastTimer = 0;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  el.style.animation = "none"; // restart the slide-in
  el.offsetHeight;
  el.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

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

let stripKey = null; // the day in the left-hand spot of the strip (null = today)

// Every day since tracking started (at least the last 7).
// Today is on the left and older days run to the right.
function renderDayStrip() {
  const today = todayKey();
  const strip = $("day-strip");
  strip.innerHTML = "";

  const first = startDate < addDays(today, -6) ? startDate : addDays(today, -6);
  for (let key = today; key >= first; key = addDays(key, -1)) {
    const date = fromKey(key);
    const tracked = key >= startDate;
    const breakout = days.has(key);
    const status = !tracked ? "not tracked" : breakout ? "breakout" : "clear";

    const li = document.createElement("li");
    const button = document.createElement("button");
    button.className = "strip-day" + (tracked ? "" : " untracked");
    button.dataset.key = key;
    button.setAttribute("aria-label", `${date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}: ${status}`);
    button.innerHTML = `
      <span class="weekday">${date.toLocaleDateString(undefined, { weekday: "short" })}</span>
      <span class="num">${date.getDate()}</span>
      <span class="mark ${tracked ? (breakout ? "breakout" : "clear") : ""}"></span>`;

    // Tap: bring the day to the left-hand spot, and open its photos if it has any
    button.addEventListener("click", () => {
      centreDay(key, true);
      if (breakout) openViewer(key);
    });

    li.appendChild(button);
    strip.appendChild(li);
  }

  centreDay(stripKey || today, false);
}

// Scrolls the strip so a day sits in the left-hand spot
function centreDay(key, smooth) {
  const strip = $("day-strip");
  const button = strip.querySelector(`[data-key="${key}"]`) || strip.querySelector(".strip-day");
  if (!button) return;
  const li = button.parentElement;
  const target = li.offsetLeft - strip.firstElementChild.offsetLeft; // today's position is the spot
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (smooth && !reduceMotion) {
    glideStrip(target);
  } else {
    stopGlide();
    strip.scrollLeft = target;
    updateStrip();
  }
}

// Our own smooth scroll. The browser's built-in one sometimes gets skipped
// when it clashes with snapping, so snapping is paused while this runs.
let glideFrame = 0;
function glideStrip(target) {
  const strip = $("day-strip");
  stopGlide();
  const start = strip.scrollLeft;
  const change = target - start;
  if (!change) return;
  const startTime = performance.now();
  strip.style.scrollSnapType = "none";
  const step = (now) => {
    const progress = Math.min(1, (now - startTime) / 380);
    const eased = 1 - (1 - progress) ** 3; // fast start, gentle stop
    strip.scrollLeft = start + change * eased;
    if (progress < 1) glideFrame = requestAnimationFrame(step);
    else strip.style.scrollSnapType = "";
  };
  glideFrame = requestAnimationFrame(step);
}

function stopGlide() {
  cancelAnimationFrame(glideFrame);
  $("day-strip").style.scrollSnapType = "";
}

// If you touch the strip mid-glide, your finger wins
$("day-strip").addEventListener("pointerdown", stopGlide, { passive: true });

// Grows the day in the left-hand spot and steps the others down in size and
// strength the further right they are, then updates the caption.
// Runs on every scroll frame, which is what makes the swipe feel alive.
function updateStrip() {
  const strip = $("day-strip");
  if (!strip.clientWidth) return; // hidden (on another screen): nothing to measure
  const firstLi = strip.firstElementChild;
  if (!firstLi) return;
  const spot = strip.scrollLeft + firstLi.offsetLeft + firstLi.offsetWidth / 2;
  let nearest = null;
  let nearestT = -1;

  for (const button of strip.querySelectorAll(".strip-day")) {
    const li = button.parentElement;
    const distance = Math.abs(li.offsetLeft + li.offsetWidth / 2 - spot);
    // Gentle falloff over ~6 days, squared so the step down is strongest near the spot
    const t = Math.max(0, 1 - distance / (li.offsetWidth * 6.5)) ** 2;
    button.style.setProperty("--t", t.toFixed(3));
    if (t > nearestT) {
      nearestT = t;
      nearest = button;
    }
  }
  if (!nearest) return;

  const key = nearest.dataset.key;
  stripKey = key === todayKey() ? null : key;

  // Caption, e.g. "Sat 24 Oct · Breakout · 2 photos"
  const label = fromKey(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const caption = $("strip-caption");
  const photos = days.get(key);
  if (key < startDate) {
    caption.textContent = `${label} · Not tracked`;
  } else if (photos) {
    caption.textContent = `${label} · Breakout · ${photos.length} photo${photos.length === 1 ? "" : "s"}`;
  } else {
    caption.textContent = `${label} · Clear`;
  }
  caption.disabled = !photos;
  caption.dataset.key = key;
}

let stripFrame = 0;
$("day-strip").addEventListener(
  "scroll",
  () => {
    cancelAnimationFrame(stripFrame);
    stripFrame = requestAnimationFrame(updateStrip);
  },
  { passive: true }
);

$("strip-caption").addEventListener("click", () => openViewer($("strip-caption").dataset.key));

// ---------- Streak and tiles ----------

function renderStreak() {
  const today = todayKey();
  const { current, best } = computeStreaks(startDate, days);
  const now = fromKey(today);
  const month = monthCounts(now.getFullYear(), now.getMonth(), startDate, days);

  // Bounce the number when it changes (not on first load)
  const number = $("streak-number");
  if (number.dataset.value !== undefined && number.dataset.value !== String(current)) {
    number.classList.remove("pop");
    number.offsetHeight; // restart the animation
    number.classList.add("pop");
  }
  number.dataset.value = current;
  number.textContent = current;
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

    let blob;
    try {
      blob = await shrinkPhoto(file);
    } catch {
      toast("That photo couldn't be opened. Try taking it again.");
      return;
    }
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
  try {
    photo.id = await addPhoto(photo);
  } catch {
    toast("Couldn't save the photo. Your phone may be low on space.");
    return; // keep the review open so the photo isn't lost
  }
  URL.revokeObjectURL(pendingPhoto.url);
  pendingPhoto = null;
  addToDays(photo);

  $("review").close();
  render();
});

$("review-cancel").addEventListener("click", () => $("review").close());

// The camera buttons are labels (that's how they open the camera), so make
// Enter and Space work on them like a normal button
for (const label of document.querySelectorAll('label[role="button"]')) {
  label.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      label.querySelector("input").click();
    }
  });
}

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
    const section = renderMonth(shownMonth.year, shownMonth.month, today, true);
    if (monthStep) {
      section.classList.add("slide");
      section.style.setProperty("--dir", monthStep);
      monthStep = 0;
    }
    months.appendChild(section);
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
      cell.setAttribute("aria-label", `${day}: clear`);
      cell.addEventListener("click", () => {
        const label = fromKey(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
        toast(`${label} · Clear day`);
      });
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
      monthStep = 1;
      renderCalendar();
    });
  }

  return section;
}

let monthStep = 0; // -1 or 1 while a month change is animating in

function moveMonth(step) {
  const d = new Date(shownMonth.year, shownMonth.month + step, 1);
  shownMonth = { year: d.getFullYear(), month: d.getMonth() };
  monthStep = step;
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

// Move to the previous (-1) or next (1) photo of the day, sliding it in
function stepViewer(step) {
  const next = viewerIndex + step;
  if (next < 0 || next >= days.get(viewerDate).length) return;
  viewerIndex = next;
  showViewerPhoto();
  const photo = $("viewer-photo");
  photo.style.setProperty("--dir", step);
  photo.classList.remove("slide");
  photo.offsetHeight; // restart the animation
  photo.classList.add("slide");
}

$("viewer-prev").addEventListener("click", () => stepViewer(-1));
$("viewer-next").addEventListener("click", () => stepViewer(1));

// Swipe left or right on the photo to flip through the day's photos
let swipeStartX = null;
$("viewer-photo").addEventListener("pointerdown", (event) => (swipeStartX = event.clientX));
$("viewer-photo").addEventListener("pointerup", (event) => {
  if (swipeStartX === null) return;
  const distance = event.clientX - swipeStartX;
  swipeStartX = null;
  if (Math.abs(distance) > 40) stepViewer(distance < 0 ? 1 : -1);
});
$("viewer-photo").addEventListener("pointercancel", () => (swipeStartX = null));
$("viewer-photo").draggable = false;

// Tapping the dark area outside the photo closes it
$("viewer").addEventListener("click", (event) => {
  const box = $("viewer").getBoundingClientRect();
  const outside =
    event.clientX < box.left || event.clientX > box.right ||
    event.clientY < box.top || event.clientY > box.bottom;
  if (outside) $("viewer").close();
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
  try {
    await deletePhoto(photos[viewerIndex].id);
  } catch {
    toast("Couldn't delete the photo. Please try again.");
    disarmDelete();
    return;
  }
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
