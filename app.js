// The screens: Today (day strip, streak or breakouts, capture), Calendar and
// Data, plus the review, photo viewer, day sheet and compare pop-ups.

let startDate; // the first day the app was used, e.g. "2026-10-29"
let days = new Map(); // "2026-10-29" -> that day's photos, oldest first: [{ id, date, photo, takenAt, url }]
let dayInfo = new Map(); // "2026-10-29" -> { date, tags: ["Stress"], status: "clear" } (only days with tags or marked clear)
let breakouts = new Set(); // breakout days, worked out from photos and dayInfo by refreshBreakouts()
let customTags = []; // tags you made yourself, added after the set list
let calendarTag = ""; // the Calendar's tag filter ("" = off)
let tagFromData = null; // a tag picked on the Data screen, applied when the Calendar opens
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
  for (const info of await getAllDayInfo()) dayInfo.set(info.date, info);
  customTags = (await getMeta("customTags")) || [];

  // Ask the browser not to clear our data when space runs low
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist();
  }

  // Lets the app open without internet (see sw.js)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
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

// The address decides the screen: …/#calendar shows the calendar, #data the
// Data screen, anything else shows Today. This makes the phone's back gesture work.
function showScreen() {
  const name = { "#calendar": "calendar", "#data": "data" }[location.hash] || "today";
  $("tabbar").hidden = name === "data"; // Data has its own back link instead
  // The phone's back gesture shouldn't leave a photo open over another screen
  returnToViewer = null; // don't reopen a photo over the new screen
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
    calendarTag = tagFromData || ""; // the tag filter starts off, unless you came from Data
    tagFromData = null;
    if (startDate) renderCalendar();
  }
  if (name === "data" && startDate) renderData();
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

// Shows a short message. Optionally with a button: action = { label, run }
let toastTimer = 0;
let toastRun = null;
function toast(message, action = null) {
  const el = $("toast");
  $("toast-text").textContent = message;
  $("toast-action").hidden = !action;
  if (action) $("toast-action").textContent = action.label;
  toastRun = action && action.run;
  el.hidden = false;
  el.style.animation = "none"; // restart the slide-in
  el.offsetHeight;
  el.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), action ? 4500 : 2600);
}

$("toast-action").addEventListener("click", () => {
  $("toast").hidden = true;
  if (toastRun) toastRun();
});

// ---------- Day tags and status ----------

// The set list (no period tag: that's tracked in another app). Your own tags come after.
const PRESET_TAGS = ["New product", "Stress", "Poor sleep", "Diet", "Travel", "Sun", "Makeup"];

// e.g. "Sat, Oct 24"
function shortDate(key) {
  return fromKey(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

// Every tag to offer: the set list, your own, then any others already used (e.g. from a backup)
function allTags() {
  const tags = [...PRESET_TAGS, ...customTags];
  for (const info of dayInfo.values()) {
    for (const tag of info.tags || []) if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

// What the picker starts with for a day: its saved tags, and Breakout unless
// a photo day was marked clear
function stateForDay(date) {
  const info = dayInfo.get(date);
  return {
    status: info && info.status === "clear" && days.has(date) ? "clear" : "breakout",
    tags: new Set(info ? info.tags : []),
  };
}

// Saves a day's tags and status. "Clear" is only stored for a day with photos,
// since a day without photos is clear anyway.
async function saveDayInfo(date, tags, status) {
  const info = { date, tags: [...tags] };
  if (status === "clear" && days.has(date)) info.status = "clear";
  if (!info.tags.length && !info.status) {
    await deleteDayInfo(date);
    dayInfo.delete(date);
  } else {
    await putDayInfo(info);
    dayInfo.set(date, info);
  }
}

// Draws the tag picker: an optional Breakout / Clear skin switch, then a chip
// for every tag (tap to turn on or off) and "+ Your own".
// state = { status, tags: Set } is changed in place; onChange runs after each change.
function renderTagPicker(container, state, options) {
  const redraw = () => {
    renderTagPicker(container, state, options);
    options.onChange();
  };
  container.innerHTML = "";

  if (options.withStatus) {
    const choice = document.createElement("div");
    choice.className = "status-switch";
    choice.setAttribute("role", "radiogroup");
    choice.setAttribute("aria-label", "How was your skin?");
    for (const [value, label] of [["breakout", "Breakout"], ["clear", "Clear skin"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", state.status === value);
      button.dataset.status = value;
      button.textContent = label;
      button.addEventListener("click", () => {
        if (state.status === value) return;
        state.status = value;
        redraw();
      });
      choice.appendChild(button);
    }
    container.appendChild(choice);
  }

  const chips = document.createElement("div");
  chips.className = "chips";
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "Tags");
  for (const tag of allTags()) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = tag;
    chip.setAttribute("aria-pressed", state.tags.has(tag));
    chip.addEventListener("click", () => {
      if (state.tags.has(tag)) state.tags.delete(tag);
      else state.tags.add(tag);
      redraw();
    });
    chips.appendChild(chip);
  }

  // "+ Your own" turns into a small text field
  const add = document.createElement("button");
  add.type = "button";
  add.className = "chip add";
  add.textContent = "+ Your own";
  add.addEventListener("click", () => {
    const form = document.createElement("form");
    form.className = "chip-form";
    form.innerHTML = `<input type="text" maxlength="24" placeholder="New tag" aria-label="New tag" enterkeyhint="done"><button class="chip" type="submit">Add</button>`;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const typed = form.querySelector("input").value.trim().replace(/\s+/g, " ");
      if (!typed) return renderTagPicker(container, state, options);
      // Reuse an existing tag if it's the same word in different capitals
      let tag = allTags().find((t) => t.toLowerCase() === typed.toLowerCase());
      if (!tag) {
        tag = typed;
        customTags.push(tag);
        setMeta("customTags", customTags).catch(() => {});
      }
      state.tags.add(tag);
      redraw();
    });
    add.replaceWith(form);
    form.querySelector("input").focus();
  });
  chips.appendChild(add);
  container.appendChild(chips);
}

// A day is a breakout if it has a photo, unless it was marked clear
function refreshBreakouts() {
  breakouts = breakoutDays(days.keys(), dayInfo);
}

function render() {
  refreshBreakouts();
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
  if (location.hash === "#data") renderData();
}

// ---------- Day strip ----------

let stripKey = null; // the day in the right-hand spot of the strip (null = today)

// Every day from the 1st of the month (or last month, in the first week).
// Older days are on the left and today is on the right.
function renderDayStrip() {
  const today = todayKey();
  const strip = $("day-strip");
  strip.innerHTML = "";

  for (let key = stripStart(today); key <= today; key = addDays(key, 1)) {
    const date = fromKey(key);
    const tracked = key >= startDate;
    const breakout = breakouts.has(key);
    const hasPhotos = days.has(key);
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

    // Tap: bring the day to the right-hand spot, and open its photos if it has any
    button.addEventListener("click", () => {
      centreDay(key, true);
      if (hasPhotos) openViewer(key);
    });

    li.appendChild(button);
    strip.appendChild(li);
  }

  centreDay(stripKey || today, false);
}

// Scrolls the strip so a day sits in the right-hand spot.
// Scrolled all the way right, today is in the spot; each older day is one step left.
function centreDay(key, smooth) {
  const strip = $("day-strip");
  const button = strip.querySelector(`[data-key="${key}"]`) || strip.lastElementChild?.firstElementChild;
  if (!button) return;
  const li = button.parentElement;
  const maxScroll = strip.scrollWidth - strip.clientWidth;
  const target = maxScroll - (strip.lastElementChild.offsetLeft - li.offsetLeft);
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

// Grows the day in the right-hand spot (the others stay small and faint),
// then updates the caption.
// Runs on every scroll frame, which is what makes the swipe feel alive.
function updateStrip() {
  const strip = $("day-strip");
  if (!strip.clientWidth) return; // hidden (on another screen): nothing to measure
  const lastLi = strip.lastElementChild;
  if (!lastLi) return;
  // Where today sits when scrolled all the way right, moved by how far we are from there
  const maxScroll = strip.scrollWidth - strip.clientWidth;
  const spot = lastLi.offsetLeft + lastLi.offsetWidth / 2 - (maxScroll - strip.scrollLeft);
  let nearest = null;
  let nearestT = -1;

  for (const button of strip.querySelectorAll(".strip-day")) {
    const li = button.parentElement;
    const distance = Math.abs(li.offsetLeft + li.offsetWidth / 2 - spot);
    // Only the day in the spot grows; it shrinks back over one day of swiping,
    // so the rest of the row stays the same size and in a straight line
    const t = Math.max(0, 1 - distance / li.offsetWidth);
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
    const status = breakouts.has(key) ? "Breakout" : "Clear";
    caption.textContent = `${label} · ${status} · ${photos.length} photo${photos.length === 1 ? "" : "s"}`;
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

// ---------- Streak and breakouts ----------

function renderStreak() {
  const today = todayKey();
  const { current } = computeStreaks(startDate, breakouts);
  const now = fromKey(today);
  const month = monthCounts(now.getFullYear(), now.getMonth(), startDate, breakouts);

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

  // "Last breakout: Sat, Oct 24 · 6 days ago". Not needed when it was today.
  const last = lastBreakout(breakouts, today);
  const lastLine = $("last-breakout");
  lastLine.hidden = !last || last === today;
  if (last && last !== today) {
    const ago = Math.round((now - fromKey(last)) / 86400000);
    const when = ago === 1 ? "yesterday" : `${ago} days ago`;
    lastLine.textContent = `Last breakout: ${shortDate(last)} · ${when}`;
  }

  // The second number: breakout days this month, e.g. "Breakouts in October"
  $("breakout-title").textContent = `Breakouts in ${now.toLocaleDateString(undefined, { month: "long" })}`;
  $("breakout-number").textContent = month.breakouts;
  $("breakout-label").textContent =
    month.breakouts === 0 ? "No breakout days so far" : month.breakouts === 1 ? "breakout day" : "breakout days";
}

// Swiping between the two numbers lights up the matching dot
const statTrack = $("stat-track");
const statDots = [...document.querySelectorAll(".stat-dot")];

statTrack.addEventListener(
  "scroll",
  () => {
    const index = Math.round(statTrack.scrollLeft / statTrack.clientWidth);
    statDots.forEach((dot, i) => {
      if (i === index) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  },
  { passive: true }
);

statDots.forEach((dot, i) =>
  dot.addEventListener("click", () => {
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    statTrack.scrollTo({ left: i * statTrack.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
  })
);

// ---------- Taking a photo: review first, then save ----------

// Which day the next picked photo is for. null = today.
// Set when you choose "Add photo" on a clear day in the Calendar.
let nextPhotoDate = null;

// Set when a photo is added from the viewer's + button: once the review
// closes (saved or not), the viewer opens again on that day.
let returnToViewer = null; // { date, id } or null

// The status and tags chosen in the review, saved along with the photo
let reviewState = { status: "breakout", tags: new Set() };

$("viewer-add").addEventListener("click", () => {
  nextPhotoDate = viewerDate;
  returnToViewer = { date: viewerDate, id: null };
});

// All photo inputs (Today button, Calendar + button and Retake) work the same way.
// On a phone they offer Take Photo or Photo Library.
for (const input of document.querySelectorAll(".camera-input")) {
  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = ""; // so picking the same file again still works
    const isRetake = !!input.closest("#review");
    const fromViewer = !!input.closest("#viewer");
    if (!isRetake && !fromViewer) returnToViewer = null;
    if (!file) {
      if (!isRetake) nextPhotoDate = null;
      return;
    }

    let blob;
    try {
      blob = await shrinkPhoto(file);
    } catch {
      toast("That photo couldn't be opened. Try another one.");
      return;
    }
    discardPending();
    pendingPhoto = { blob, url: URL.createObjectURL(blob) };

    // A retake keeps the date already chosen; a new photo starts on today
    // (or the Calendar day it was added from)
    const dateInput = $("review-date");
    dateInput.max = todayKey();
    if (!isRetake) {
      dateInput.value = nextPhotoDate || todayKey();
      nextPhotoDate = null;
      // Breakout is picked to start with; the day's tags so far are kept
      reviewState = stateForDay(dateInput.value);
      renderTagPicker($("review-tags"), reviewState, { withStatus: true, onChange() {} });
    }
    $("review-photo").src = pendingPhoto.url;
    if (fromViewer) $("viewer").close(); // the review takes its place for a moment
    if (!$("review").open) $("review").showModal();
  });
}

// Save adds the photo to the chosen day. Photos already on that day are kept.
$("review-save").addEventListener("click", async () => {
  if (!pendingPhoto) return;
  const today = todayKey();
  let date = $("review-date").value || today;
  if (date > today) date = today; // no photos in the future

  // A photo for an earlier day doesn't have a real time of day, so it's
  // filed at midday and the viewer leaves the time off
  const photo = { date, photo: pendingPhoto.blob, takenAt: Date.now() };
  if (date !== today) {
    photo.takenAt = fromKey(date).getTime() + 12 * 60 * 60 * 1000 + (Date.now() % 60000);
    photo.timeUnknown = true;
  }

  try {
    photo.id = await addPhoto(photo);
    // A photo from before tracking started moves the start back to that day
    if (date < startDate) {
      await setMeta("startDate", date);
      startDate = date;
    }
  } catch {
    toast("Couldn't save the photo. Your phone may be low on space.");
    return; // keep the review open so the photo isn't lost
  }
  URL.revokeObjectURL(pendingPhoto.url);
  pendingPhoto = null;
  addToDays(photo);
  try {
    await saveDayInfo(date, reviewState.tags, reviewState.status);
  } catch {
    toast("The photo is saved, but its tags couldn't be. Try adding them again.");
  }

  if (returnToViewer) returnToViewer = { date, id: photo.id };
  $("review").close();
  render();
  if (date !== today) {
    const label = fromKey(date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    toast(`Added to ${label}`);
  }
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
$("review").addEventListener("close", () => {
  discardPending();
  if (!returnToViewer) return;
  const { date, id } = returnToViewer;
  returnToViewer = null;
  if (!days.has(date)) return;
  openViewer(date);
  const index = days.get(date).findIndex((photo) => photo.id === id);
  if (index >= 0) {
    viewerIndex = index;
    showViewerPhoto();
  }
});

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

  // Tag filter: "Tag" when off, the tag's name when on
  const filter = $("tag-filter");
  filter.innerHTML = "";
  filter.add(new Option("No tag", ""));
  for (const tag of allTags()) filter.add(new Option(tag, tag));
  filter.value = calendarTag;
  $("tag-filter-label").textContent = calendarTag || "Tag";

  $("legend").innerHTML =
    (calendarView === "photos"
      ? `<span><i class="key clear"></i>Clear</span><span><i class="key breakout"></i>Breakout</span><span><i class="key none"></i>Not tracked</span>`
      : `<span><i class="key line"></i>Breakout</span>`) +
    (calendarTag ? `<span><i class="key ring"></i>${escapeHtml(calendarTag)}</span>` : `<span><i class="key dot"></i>Tagged</span>`);

  const months = $("months");
  months.className = calendarView + (calendarTag ? " filtering" : ""); // filtering fades untagged days
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

  const counts = monthCounts(year, month, startDate, breakouts, today);
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
      // A photo day: breakout, or clear if it was marked so
      const photos = days.get(key);
      const breakout = breakouts.has(key);
      cell.classList.add(breakout ? "breakout" : "clear", "has-photo");
      if (calendarView === "photos") {
        cell.style.backgroundImage = `url(${photos[photos.length - 1].url})`; // latest photo
        if (photos.length > 1) {
          const count = document.createElement("span");
          count.className = "count";
          count.textContent = photos.length;
          cell.appendChild(count);
        }
      } else if (breakout) {
        // Join the line to breakout days next to it in the same week row
        if (weekday > 0 && day > 1 && breakouts.has(addDays(key, -1))) cell.classList.add("join-left");
        if (weekday < 6 && day < daysInMonth && breakouts.has(addDays(key, 1))) cell.classList.add("join-right");
      }
      const label = photos.length === 1 ? "1 photo" : `${photos.length} photos`;
      cell.setAttribute("aria-label", `${day}: ${breakout ? "breakout" : "clear"}, ${label}`);
      cell.addEventListener("click", () => openViewer(key));
    } else {
      cell.classList.add("clear");
      cell.setAttribute("aria-label", `${day}: clear`);
      cell.addEventListener("click", () => openDaySheet(key));
    }

    // Tagged days get a small dot; with the tag filter on, its days get a ring
    const tags = (dayInfo.get(key) || {}).tags || [];
    if (tags.length && !cell.disabled) {
      const dot = document.createElement("span");
      dot.className = "tag-dot";
      cell.appendChild(dot);
      cell.setAttribute("aria-label", `${cell.getAttribute("aria-label")}, tagged ${tags.join(", ")}`);
    }
    if (calendarTag && tags.includes(calendarTag)) cell.classList.add("tagged");
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

// Tag filter. Also not remembered.
$("tag-filter").addEventListener("change", () => {
  calendarTag = $("tag-filter").value;
  renderCalendar();
});

// Tag names are your own words, so they're escaped before going into HTML
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- Day sheet: a day without photos ----------

let sheetDate = null;

function openDaySheet(date) {
  sheetDate = date;
  $("day-sheet-title").textContent = fromKey(date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const state = stateForDay(date);
  renderTagPicker($("day-sheet-tags"), state, {
    withStatus: false,
    async onChange() {
      try {
        await saveDayInfo(date, state.tags, "breakout");
      } catch {
        toast("Couldn't save the tags. Please try again.");
      }
      render();
    },
  });
  $("day-sheet").showModal();
}

$("day-sheet-done").addEventListener("click", () => $("day-sheet").close());
closeOnOutsideTap($("day-sheet"));

$("day-sheet-photo").addEventListener("click", () => {
  $("day-sheet").close();
  nextPhotoDate = sheetDate;
  $("calendar-camera").click();
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
  const time = photo.timeUnknown
    ? ""
    : " · " + new Date(photo.takenAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  // e.g. "Tuesday, October 20" and, below it, "2026 · 7:43 PM"
  $("viewer-day").textContent = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  $("viewer-month").textContent = d.getFullYear() + time;
  $("viewer-photo").src = photo.url;
  if (!focusSingle) $("focus-photo").src = photo.url; // keeps full screen in step when swiping

  $("viewer-pager").hidden = photos.length < 2;
  $("viewer-count").textContent = `${viewerIndex + 1} of ${photos.length}`;
  $("viewer-prev").disabled = viewerIndex === 0;
  $("viewer-next").disabled = viewerIndex === photos.length - 1;
  disarmDelete();

  // The day's status and tags. Changes save straight away.
  const date = viewerDate;
  const state = stateForDay(date);
  renderTagPicker($("viewer-tags"), state, {
    withStatus: true,
    async onChange() {
      try {
        await saveDayInfo(date, state.tags, state.status);
      } catch {
        toast("Couldn't save that change. Please try again.");
      }
      render();
    },
  });
}

// Move to the previous (-1) or next (1) photo of the day, sliding it in
function stepViewer(step) {
  const next = viewerIndex + step;
  if (next < 0 || next >= days.get(viewerDate).length) return;
  viewerIndex = next;
  showViewerPhoto();
  for (const photo of [$("viewer-photo"), $("focus-photo")]) {
    photo.style.setProperty("--dir", step);
    photo.classList.remove("slide");
    photo.offsetHeight; // restart the animation
    photo.classList.add("slide");
  }
}

$("viewer-prev").addEventListener("click", () => stepViewer(-1));
$("viewer-next").addEventListener("click", () => stepViewer(1));

// Tells a tap apart from a sideways swipe on an element.
// A swipe calls onSwipe(1) for next or onSwipe(-1) for previous.
function onTapOrSwipe(element, onTap, onSwipe) {
  let startX = null;
  let startY = 0;
  let moved = false;
  element.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
    startY = event.clientY;
    moved = false;
  });
  element.addEventListener("pointerup", (event) => {
    if (startX === null) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    startX = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      moved = true;
      onSwipe(dx < 0 ? 1 : -1);
    } else if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      moved = true;
    }
  });
  element.addEventListener("pointercancel", () => {
    startX = null;
    moved = true;
  });
  // Act on the click (not pointerup), so the click can't land on whatever is underneath
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    if (moved) {
      moved = false;
      return;
    }
    onTap();
  });
}

// Full screen shows either the viewer's photo (swipe for the day's others)
// or one photo from Compare (no swiping)
let focusSingle = false;

// Viewer photo: tap for full screen, swipe for the day's other photos
onTapOrSwipe(
  $("viewer-photo"),
  () => {
    focusSingle = false;
    $("focus-photo").src = $("viewer-photo").src;
    $("focus").showModal();
  },
  stepViewer
);
$("viewer-photo").draggable = false;

// Full screen: tap anywhere to go back, swipe for the day's other photos
onTapOrSwipe($("focus"), () => $("focus").close(), (step) => {
  if (!focusSingle) stepViewer(step);
});

// ---------- Compare two photos ----------

// Lists every other photo, newest first, to pick the second one
$("viewer-compare").addEventListener("click", () => {
  const current = days.get(viewerDate)[viewerIndex];
  const others = [...days.values()].flat().filter((photo) => photo !== current);
  if (!others.length) {
    toast("Add another photo first, then you can compare.");
    return;
  }
  others.sort((a, b) => b.takenAt - a.takenAt);

  const list = $("compare-list");
  list.innerHTML = "";
  for (const photo of others) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "pick";
    button.innerHTML = `
      <img src="${photo.url}" alt="">
      <span><span class="pick-date">${shortDate(photo.date)}</span>
      <span class="micro">${fromKey(photo.date).getFullYear()} · ${breakouts.has(photo.date) ? "Breakout" : "Clear"}</span></span>`;
    button.addEventListener("click", () => {
      $("compare-pick").close();
      openCompare(current, photo);
    });
    item.appendChild(button);
    list.appendChild(item);
  }
  $("compare-pick").showModal();
});

$("compare-pick-close").addEventListener("click", () => $("compare-pick").close());
closeOnOutsideTap($("compare-pick"));

// Two photos side by side, the older one on the left
function openCompare(a, b) {
  const [left, right] = a.takenAt <= b.takenAt ? [a, b] : [b, a];
  for (const [side, photo] of [["a", left], ["b", right]]) {
    const date = fromKey(photo.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    $(`compare-${side}`).src = photo.url;
    $(`compare-${side}`).alt = `Photo from ${date}`;
    $(`compare-${side}-date`).textContent = date;
  }
  $("compare").showModal();
}

// Tap either photo to see it full screen
for (const side of ["a", "b"]) {
  $(`compare-${side}`).addEventListener("click", () => {
    focusSingle = true;
    $("focus-photo").src = $(`compare-${side}`).src;
    $("focus").showModal();
  });
}

$("compare-close").addEventListener("click", () => $("compare").close());

// Tapping the dark area outside a pop-up closes it
function closeOnOutsideTap(dialog) {
  dialog.addEventListener("click", (event) => {
    const box = dialog.getBoundingClientRect();
    const outside =
      event.clientX < box.left || event.clientX > box.right ||
      event.clientY < box.top || event.clientY > box.bottom;
    if (outside) dialog.close();
  });
}
closeOnOutsideTap($("viewer"));

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

// ---------- Data screen ----------
// Plain counts only: no scores, no advice.

function renderData() {
  const today = todayKey();
  $("data-since").textContent =
    "Since " + fromKey(startDate).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  // Totals
  const tracked = Math.round((fromKey(today) - fromKey(startDate)) / 86400000) + 1;
  const breakoutCount = [...breakouts].filter((date) => date >= startDate && date <= today).length;
  const { best } = computeStreaks(startDate, breakouts, today);
  $("data-totals").innerHTML = [
    [tracked, tracked === 1 ? "day tracked" : "days tracked"],
    [breakoutCount, breakoutCount === 1 ? "breakout day" : "breakout days"],
    [best, "longest clear run"],
  ]
    .map(([n, label]) => `<div class="data-total"><strong class="display">${n}</strong><span class="micro">${label}</span></div>`)
    .join("");

  renderMonthChart(today);

  // Tags, most used first
  const rows = tagStats(dayInfo, breakouts);
  const list = $("data-tags");
  list.innerHTML = "";
  if (!rows.length) {
    list.innerHTML = `<p class="data-empty">No tags yet. Add them when you save a photo, or tap a clear day in the Calendar.</p>`;
    return;
  }
  for (const row of rows) {
    const button = document.createElement("button");
    button.className = "tag-row";
    button.innerHTML = `
      <span class="tag-row-name">${escapeHtml(row.tag)}</span>
      <span class="micro">${row.days} day${row.days === 1 ? "" : "s"} tagged · ${row.followed} with a breakout within 2 days</span>
      <span class="tag-row-bar" aria-hidden="true"><i style="width:${(row.followed / row.days) * 100}%"></i></span>`;
    button.setAttribute("aria-label", `${row.tag}: tagged on ${row.days} days, a breakout came on or within 2 days after ${row.followed} of them. Show in Calendar.`);
    button.addEventListener("click", () => {
      tagFromData = row.tag;
      location.hash = "#calendar";
    });
    list.appendChild(button);
  }
}

// Breakout days in each of the last 6 months (fewer when tracking started
// more recently), as thin bars (inline SVG)
function renderMonthChart(today) {
  const now = fromKey(today);
  const months = [];
  // Only months since tracking started, so an untracked month never shows as 0
  const start = fromKey(startDate);
  const span = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
  for (let i = Math.min(5, span); i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const counts = monthCounts(d.getFullYear(), d.getMonth(), startDate, breakouts, today);
    months.push({ label: d.toLocaleDateString(undefined, { month: "short" }), full: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }), value: counts.breakouts });
  }
  const max = Math.max(1, ...months.map((m) => m.value));
  const width = 320;
  const height = 140;
  const top = 20; // room for the numbers above the bars
  const base = height - 24; // room for the month names below
  const slot = width / months.length;
  const bar = 20;

  const bars = months
    .map((m, i) => {
      const x = i * slot + (slot - bar) / 2;
      const h = m.value ? Math.max(4, ((base - top) * m.value) / max) : 0;
      const y = base - h;
      // Rounded top, flat bottom on the baseline
      const path = h
        ? `M${x},${base} V${y + 4} Q${x},${y} ${x + 4},${y} H${x + bar - 4} Q${x + bar},${y} ${x + bar},${y + 4} V${base} Z`
        : "";
      return `<g>
        <title>${m.full}: ${m.value} breakout day${m.value === 1 ? "" : "s"}</title>
        <rect x="${i * slot}" y="0" width="${slot}" height="${height}" fill="transparent"/>
        ${path ? `<path d="${path}" class="chart-bar"/>` : ""}
        <text x="${x + bar / 2}" y="${y - 6}" class="chart-value">${m.value}</text>
        <text x="${x + bar / 2}" y="${height - 6}" class="chart-label">${m.label}</text>
      </g>`;
    })
    .join("");

  $("data-chart").innerHTML = `
    <svg class="month-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Breakout days in each month">
      <line x1="0" x2="${width}" y1="${base}" y2="${base}" class="chart-axis"/>
      ${bars}
    </svg>
    <table class="visually-hidden">
      <caption>Breakout days per month</caption>
      ${months.map((m) => `<tr><th>${m.full}</th><td>${m.value}</td></tr>`).join("")}
    </table>`;
}

// ---------- Backup ----------
// A backup is one zip file made on the phone: data.json (dates and times)
// plus every photo. Nothing is uploaded; you choose where the file goes.

let readyBackup = null; // a finished backup file waiting for a second tap (see below)

$("open-backup").addEventListener("click", async () => {
  readyBackup = null;
  $("backup-export").textContent = "Save a backup";
  const last = await getMeta("lastBackup");
  $("backup-last").textContent = last
    ? `Last backup: ${new Date(last).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
    : "No backup yet";
  $("backup").showModal();
});

$("backup-close").addEventListener("click", () => $("backup").close());
closeOnOutsideTap($("backup"));

async function makeBackupFile() {
  const encoder = new TextEncoder();
  const photos = [];
  const files = [];
  for (const date of [...days.keys()].sort()) {
    const list = days.get(date);
    for (let i = 0; i < list.length; i++) {
      const { photo, takenAt, timeUnknown } = list[i];
      const extension = { "image/png": "png", "image/webp": "webp" }[photo.type] || "jpg";
      const file = `photos/${date}_${i + 1}.${extension}`;
      photos.push({ file, date, takenAt, timeUnknown: !!timeUnknown, type: photo.type || "image/jpeg" });
      files.push({ name: file, bytes: new Uint8Array(await photo.arrayBuffer()) });
    }
  }
  // Version 2 adds each day's tags and status, and your own tag words
  const data = {
    app: "skin-tracker",
    version: 2,
    exportedAt: Date.now(),
    startDate,
    photos,
    dayInfo: [...dayInfo.values()],
    customTags,
  };
  files.unshift({ name: "data.json", bytes: encoder.encode(JSON.stringify(data, null, 2)) });
  return new File([makeZip(files)], `skin-tracker-backup-${todayKey()}.zip`, { type: "application/zip" });
}

// On iPhone this opens the Share sheet (choose "Save to Files").
// Elsewhere the file downloads.
async function handOver(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file] });
  } else {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  await setMeta("lastBackup", Date.now());
  $("backup").close();
  toast("Backup saved");
}

$("backup-export").addEventListener("click", async () => {
  const button = $("backup-export");
  try {
    if (!readyBackup) {
      button.disabled = true;
      button.textContent = "Preparing…";
      readyBackup = await makeBackupFile();
    }
    await handOver(readyBackup);
    readyBackup = null;
  } catch (error) {
    if (error.name === "AbortError") {
      // You closed the Share sheet: nothing saved, try again whenever
    } else if (error.name === "NotAllowedError" && readyBackup) {
      // Phones only open the Share sheet straight after a tap, and building
      // a big backup takes a moment, so ask for one more tap
      button.textContent = "Ready. Tap to save";
      return;
    } else {
      toast("Couldn't make the backup. Please try again.");
    }
    readyBackup = null;
  } finally {
    button.disabled = false;
    if (!readyBackup) button.textContent = "Save a backup";
  }
});

// Restoring adds photos and never removes any. A photo that's already here
// (same day and time) is skipped, so restoring twice is harmless.
$("backup-import").addEventListener("change", async (event) => {
  const input = event.target;
  const file = input.files[0];
  input.value = ""; // so the same file can be picked again
  if (!file) return;

  let data;
  let contents;
  try {
    const entries = readZip(new Uint8Array(await file.arrayBuffer()));
    contents = new Map(entries.map((entry) => [entry.name, entry.bytes]));
    data = JSON.parse(new TextDecoder().decode(contents.get("data.json")));
    if (data.app !== "skin-tracker" || !Array.isArray(data.photos)) throw new Error("not a backup");
  } catch {
    toast("That file isn't a Skin Tracker backup, or it's damaged.");
    return;
  }

  const isDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  let added = 0;
  let unreadable = 0;
  try {
    for (const item of data.photos) {
      const bytes = contents.get(item.file);
      if (!bytes || !isDate(item.date) || typeof item.takenAt !== "number") {
        unreadable++;
        continue;
      }
      if ((days.get(item.date) || []).some((photo) => photo.takenAt === item.takenAt)) continue;
      const photo = { date: item.date, photo: new Blob([bytes], { type: item.type || "image/jpeg" }), takenAt: item.takenAt };
      if (item.timeUnknown) photo.timeUnknown = true;
      photo.id = await addPhoto(photo);
      addToDays(photo);
      added++;
    }

    // Tags are added to the ones already here, never removed. A day marked
    // clear here stays clear; one marked clear in the backup becomes clear.
    const isTag = (tag) => typeof tag === "string" && tag.trim() && tag.length <= 40;
    for (const item of Array.isArray(data.dayInfo) ? data.dayInfo : []) {
      if (!item || !isDate(item.date)) continue;
      const here = dayInfo.get(item.date);
      const tags = new Set(here ? here.tags : []);
      for (const tag of Array.isArray(item.tags) ? item.tags : []) if (isTag(tag)) tags.add(tag);
      const status = (here && here.status) || (item.status === "clear" ? "clear" : undefined);
      await saveDayInfo(item.date, tags, status);
    }
    for (const tag of Array.isArray(data.customTags) ? data.customTags : []) {
      if (isTag(tag) && !PRESET_TAGS.includes(tag) && !customTags.includes(tag)) customTags.push(tag);
    }
    await setMeta("customTags", customTags);

    // Tracking starts on the earliest day from either place
    const earliest = [startDate, isDate(data.startDate) ? data.startDate : null, ...days.keys()]
      .filter(Boolean)
      .sort()[0];
    if (earliest < startDate) {
      await setMeta("startDate", earliest);
      startDate = earliest;
    }
  } catch {
    render();
    toast(`Stopped after ${added} photo${added === 1 ? "" : "s"}. Your phone may be low on space.`);
    return;
  }

  render();
  $("backup").close();
  let message = added
    ? `Restored ${added} photo${added === 1 ? "" : "s"}`
    : "Everything in this backup is already here";
  if (unreadable) message += `. ${unreadable} couldn't be read`;
  toast(message);
});

// If the app stays open past midnight, refresh when you come back to it
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) render();
});

init();
