# Skin Tracker

A private, on-device web app for tracking skin over time. Full requirements are in `PRD.md`.

## Working with Anvi
- Anvi is a beginner learning Claude Code, and a visual designer. Explain things in plain language and keep every step small.
- When a new tool comes up (git, DevTools, `node --test`, and so on), say in one line what it is for.
- Plan before code. Work one PRD phase at a time and stop after each phase for her go-ahead.
- Commit to git after each working step.

## Hard rules
- **Photos never leave the device.** They are stored only in IndexedDB. Never add network calls with user data: no analytics, no third-party scripts, no CDN fonts, no error reporters.
- **Vanilla HTML, CSS and JavaScript.** No framework and no build step.
- **Ask before adding any dependency**, including downloaded font or icon files.
- **Never lose existing photos.** Any schema change needs a `DB_VERSION` bump and a tested migration.
- Never commit face photos. Use generated placeholder images for testing.
- No medical advice or skin scores. Keep wording gentle. No emoji in the UI; use inline SVG line icons.

## Product decision
Option B (breakout days only): photos are taken only on breakout days (any number per day), and a day without a photo counts as clear. The streak is the number of clear days in a row.

## Project layout
- `index.html`, `style.css`: page and styles
- `app.js`: screen logic (streak, capture, calendar, viewer). The Today day strip is a horizontal scroll-snap carousel from `stripStart()` (the 1st of this month, or the 1st of last month during days 1–7) up to today. Today is on the RIGHT and older days run to the left. `updateStrip()` runs on each scroll frame and sets `--t` (0 to 1, squared falloff over about 6 days) so the day in the right-hand spot grows, and it updates the caption (right-aligned). Tapping a day glides it into the spot with `glideStrip()`, our own rAF animation, because native smooth scroll is unreliable alongside snapping. A breakout day also opens the viewer.
- Adding photos: file inputs have no `capture` attribute, so iPhone offers Take Photo or Photo Library. The review dialog has a date field (max today, default today, or `nextPhotoDate` when "Add photo" is tapped on a clear day's toast; the Calendar title row has a + button too). A past-date photo is saved with `timeUnknown: true` (the viewer hides its time). Saving before `startDate` moves `startDate` back, so the days in between count as clear.
- Viewer: tapping the photo opens `#focus`, a full-screen photo with no UI. In full screen, a tap closes it and a swipe changes photo (`onTapOrSwipe()`); the viewer stays open underneath.
- Testing note: in the automated Chrome, rAF and CSS animations barely run while the window is in the background. Take screenshots to pump frames before judging an animation. There are two screens, Today and Calendar, chosen by the URL hash (`#today`, `#calendar`). The floating nav bar is a frosted-glass pill (soft grey tint plus backdrop blur) with only Today and Calendar text labels. A solid white pill slides to the active one and resizes to fit its label (`placeThumb()` sets `--thumb-x` and `--thumb-w`). There is no camera button in the nav. The Calendar screen is left-aligned and Notion-style: view tabs Photos | Lines (underline on the active tab, remembered in localStorage), a "Month ⌄" picker on the right (Month / All months, a native select under a text label; it resets to Month each time the screen opens), and in Month mode a toolbar with the month on the left and Today ‹ › on the right.
- `db.js`: IndexedDB storage, version 2. `photos` (auto id, indexed by `date`) allows any number of photos per day; `meta` holds `startDate`. The old v1 `entries` store (one photo per day) is kept untouched as a backup. Remove it in v3 only after export/import exists. The version history is at the top of the file.
- `dates.js`: date helpers and streak maths; it must stay loadable in Node for tests
- `tests/`: `node --test` tests for `dates.js`
- `fonts/`: bundled Instrument Serif 400 (headings) and Inconsolata 500 (body), with their OFL licences
- Design tokens live at the top of `style.css` (palette v2 from PRD §7). Status colours: clear = `--blue`, breakout = `--orange`.
- Spacing: use only the scale tokens `--s1`…`--s7` (4, 8, 12, 16, 24, 32, 48px) for margin, padding and gap, and `--gutter` (20px) for screen edges. No raw pixel spacing.
- `references/`: design reference boards, kept out of git (other people's work)

## Commands
- Run tests: `node --test`
- Hosting: GitHub Pages serves the `main` branch. Pushing to `main` updates the live site.
