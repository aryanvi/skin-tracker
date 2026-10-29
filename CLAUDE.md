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
Option B (breakout days only): a photo is taken only on a breakout day, and a day without a photo counts as clear. The streak is the number of clear days in a row.

## Project layout
- `index.html`, `style.css`: page and styles
- `app.js`: screen logic (streak, capture, calendar, viewer). There are two screens, Today and Calendar, chosen by the URL hash (`#today`, `#calendar`) and switched with the floating nav bar. The Calendar screen has two switches. Photos | Lines (Lines = an orange line under breakout days, no photos) is remembered in localStorage. Month | All defaults to one month with arrows and resets each time the screen opens; All stacks months newest-first.
- `db.js`: IndexedDB storage (`entries` keyed by "YYYY-MM-DD", `meta` holds `startDate`)
- `dates.js`: date helpers and streak maths; it must stay loadable in Node for tests
- `tests/`: `node --test` tests for `dates.js`
- `fonts/`: bundled Instrument Serif 400 (headings) and Inconsolata 500 (body), with their OFL licences
- Design tokens live at the top of `style.css` (palette v2 from PRD §7). Status colours: clear = `--blue`, breakout = `--orange`.
- `references/`: design reference boards, kept out of git (other people's work)

## Commands
- Run tests: `node --test`
- Hosting: GitHub Pages serves the `main` branch. Pushing to `main` updates the live site.
