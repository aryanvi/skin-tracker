# PRD: Skin Tracker (working title)

A private, on-device web app for tracking skin over time with one photo a day.
Owner: Anvi (visual design intern, learning Claude Code and vibe coding).
Status: v0 prototype exists. This PRD describes what to refine and in what order.

> **For Claude Code:** Read this whole file first. Anvi is a beginner and a designer, so explain
> things in plain language and keep every step small. Start in plan mode. Before building anything,
> ask her the question in "Open decision" below. Then do **Phase 1 only**, show her, and commit.
> Do not start the next phase until she says so.

---

## 1. Why this exists

Anvi wants to see how her acne changes across weeks and months. Single photos are hard to compare
and phone photo albums are cluttered with everything else. She wants a calm, simple place that is
only for this: open it in the morning, take a photo, and look back through a clean visual history.

The project is also a **learning project**. Part of the goal is to practise Claude Code and see the
tools vibe coders use. Where it costs little, prefer a workflow that teaches something (see section 9).

## 2. Goals and non-goals

**Goals**
- Log one face photo per day in a few seconds.
- See the whole history at a glance, grouped by month, as a visual album rather than a data table.
- Compare two dates side by side.
- Photos never leave her phone.
- Look like her work: soft, pastel, designed, not a default template.

**Non-goals (do not build)**
- Accounts, login, cloud sync, or any server.
- Product tracking, diet logs, AI diagnosis, severity scores, or medical advice. She said she needs no extra information.
- Sharing or social features.
- A native iPhone app. This stays a web app / PWA.

## 3. Current state (what the prototype does today)

Files in the project folder: `index.html`, `style.css`, `app.js`, `db.js`, `dates.js`. No build step, no dependencies.

- Storage: IndexedDB (`skin-tracker` database, `entries` store keyed by date, `meta` store for the start date). Nothing touches the network.
- Capture: `<input type="file" capture="user">` opens the phone's selfie camera. Photos are shrunk to 1200px JPEG at 0.85 quality.
- Home screen: a streak counter, one button, a month calendar, and a photo pop-up viewer with a two-tap delete.
- **Logic today:** a photo is saved **only on a breakout day**. A day with no photo counts as a "clear day" and extends the streak.

### Gaps and risks found in the prototype
1. **It does not match the original idea.** Anvi described a daily photo album. Today's app only keeps breakout photos, so there is no photo history on good days.
2. **Streak is guessable, not recorded.** Any day she forgets to open the app counts as "clear".
3. **Hosting.** It was opened as a local file on a laptop. To use it on her phone it must be served over HTTPS, and data on laptop and phone are separate (IndexedDB is per device and per browser).
4. **No backup.** If the browser clears site data, every photo is lost. The app asks the browser to persist storage, but that is not a guarantee.
5. **Schema is hard-coded.** `db.js` only creates stores on first run. Any new field needs a `DB_VERSION` bump and an upgrade path so existing photos survive.
6. Not yet installable (no manifest or service worker), no thumbnails (the calendar loads full-size photos), and emoji in the UI do not fit her design style.

## 4. Open decision (ask Anvi first)

> Should every day get a photo, or only breakout days?

- **Option A, recommended:** one photo every day, plus an optional one-tap tag: *Clear / Some / Flare*.
  This gives the album she described. The streak becomes real data: consecutive days tagged *Clear*.
  Existing prototype photos migrate as *Flare*.
- **Option B:** keep the current breakout-only behaviour. Simpler, but there is no daily album.

The rest of this PRD assumes **Option A**. If she picks B, drop the daily-album and compare features and keep Phases 1 to 2 as written.

## 5. Users and key stories

One user: Anvi, on her own phone, usually in the morning.

- As Anvi, I open the app and can take today's photo in two taps.
- I can see all my photos, newest first, grouped by month.
- I can tap any day and see its photo large.
- I can pick two dates and compare them side by side.
- I can retake or delete a photo, with protection against accidental delete.
- I can back up all my photos and restore them if my phone changes.
- I can trust that nothing is uploaded anywhere.

## 6. Phases

Each phase ends with something she can run and look at. Commit to git when a phase works.

### Phase 0: Setup and hosting
- Create `CLAUDE.md` (see section 9). Initialise git and make a first commit of the prototype.
- Put the app online as a static site over HTTPS so it opens on her phone. Suggest GitHub Pages or Netlify and explain the tradeoff. Photos still live only on the device that took them.
- **Done when:** the app opens on her phone from a URL and a photo saves and reloads after closing the browser.

### Phase 1: Daily photo and the new home screen
- Implement the Open decision (Option A). Bump `DB_VERSION` to 2, add `status` (`clear | some | flare`) to entries, migrate old entries to `flare`.
- Home screen redesign per section 7: day strip, big streak number, one primary capture button.
- After taking a photo, show it, offer the optional status tag (one tap, skippable), and save.
- One photo per day. Retake replaces it.
- **Done when:** she can take today's photo, tag or skip, retake, and old photos still appear.

### Phase 2: Album
- Generate a small thumbnail when saving (about 300px) and store it next to the full photo. Back-fill thumbnails for existing entries.
- Album screen: month sections, each a grid of circular photo thumbnails (empty days faded). Month header with a year dropdown pill.
- Tapping a photo opens a full-screen viewer with a large date numeral and swipe between days.
- **Done when:** a year of fake test photos scrolls smoothly and the viewer swipes day to day.

### Phase 3: Compare and progress
- Compare screen: choose two dates, show side by side with a draggable slider to wipe between them.
- Progress screen with a black segmented control (Month / Year / All): current streak, best streak, clear-day rate, and a year heat map of small rounded squares coloured by status.
- **Done when:** compare works for any two days and the heat map matches the tags.

### Phase 4: Installable and safe
- Add a web app manifest, icons, and a service worker so it installs to the home screen and works offline.
- Export all data as a zip (photos and a JSON file) and import it back.
- Optional daily reminder only if feasible without a server. If not feasible on iOS, say so and skip it.
- **Done when:** installed on her home screen, works in airplane mode, and export then import restores everything.

### Phase 5: Stretch (only if she wants)
- Live camera with a faint face-outline guide and a ghost of yesterday's photo for alignment. This needs `getUserMedia` instead of the file input, and works only over HTTPS.
- Sparse notes per day.
- Time-lapse playback of a month.

## 7. Screens and design direction

Her three reference boards are **style direction, not templates to copy**. Do not reproduce their
content, branding, icons or layouts one to one.

### What to take from the references
| Reference | Take this |
|---|---|
| Habit "Statistics" screens | Soft light background, black pill segmented control, floating black bottom bar with a raised centre button (colours now come from palette v2, not this board), rounded light cards, year heat map of rounded squares, tile summary (current streak, success rate, best streak, total) |
| Gradient fitness screen | Large display numerals, a day strip where the selected day is bigger, frosted translucent stat tiles over the **sunset gradient** (see Hero gradient below; replaces the gold in the reference), a white sheet rising over the gradient, thin gradient range bars, a black circular add button |
| Photo journal boards | Circular photo calendar by month, faded circles for empty days, stacked polaroid-style cards with a slight rotation, blurred "+12" overflow card, big date numeral on the photo, month/year dropdown pill, tiny uppercase monospace micro-labels, grainy gradients |

### Screens
1. **Today (home).** Day strip across the top. A very large streak number. Short label under it. A frosted tile row (best streak, photos this month). One primary capture button. A soft gradient behind the top half that fades into a white sheet.
2. **Capture result.** The photo, large. Three small status pills (Clear, Some, Flare), Skip, Save.
3. **Album.** Month sections with circular thumbnails. Year pill at the top. Tap opens the viewer.
4. **Viewer.** Full-bleed photo card, large date numeral overlaid, swipe left or right, a quiet delete action that needs a second tap.
5. **Compare.** Two date chips, split image with a drag handle.
6. **Progress.** Segmented control, summary tiles, year heat map.
7. **Settings.** Export, import, storage used, and a short plain statement that nothing is uploaded.

### Navigation
A floating black pill bar with three icons (Today, Album, Progress) and a raised black circular button
in the middle for the camera. It sits above the home indicator and respects safe-area insets.

### Design tokens
**Palette v2 (decided by Anvi):** the hero is the blue-to-orange sunset gradient, not gold. Colours come from her journal and sunset board
(`references/04-journal-and-sunset-colours.png`). They were sampled from the image, so treat them as final unless she asks to tweak.

```css
:root {
  --bg:          #FDFDFD;  /* page */
  --surface:     #FFFFFF;  /* sheets and cards */
  --surface-2:   #F1F2F6;  /* quiet cards, inactive pills */
  --ink:         #111111;  /* text, black pills, nav bar, camera button */
  --ink-muted:   #656976;  /* secondary text (4.9:1 on the page colour) */

  --periwinkle:  #9DA7CA;  /* sky blue, top of the hero */
  --blue:        #ACC8EA;  /* clear */
  --blue-pale:   #D4E1F4;  /* tracks, quiet fills */
  --blue-mist:   #D6E2EE;
  --lilac:       #B2ADF5;  /* accent */

  --amber:       #F6B85D;  /* some */
  --orange:      #F58D5E;  /* flare: warm and soft, not alarming */
  --peach:       #FDBE7D;
  --sunset:      #F98240;  /* rare accent, for example the active tab dot */

  /* Hero gradient: sunset sky, sampled from references/05-sunset-gradient.png.
     Periwinkle at the top, through lavender and peach, to orange at the bottom. */
  --hero-gradient: linear-gradient(180deg,
    #95A1BF 0%, #9DA8CC 10%, #A4B1D3 21%, #AEB6D4 32%, #C7BFC1 43%,
    #ECCDBB 53%, #F9CFA9 64%, #FDBF84 75%, #FEAC64 85%, #FD9144 100%);

  --radius-card: 20px;
  --radius-pill: 999px;
  --shadow-soft: 0 1px 4px rgba(0,0,0,.06);

  --font-heading: "Instrument Serif", Georgia, serif;           /* Regular, 400 */
  --font-body:    "Inconsolata", ui-monospace, Consolas, monospace; /* Medium, 500 */
}

body { font-family: var(--font-body); font-weight: 500; font-synthesis: none; }
h1, h2, h3, .display { font-family: var(--font-heading); font-weight: 400; }
```

- **Status colours:** Clear = soft blue, Some = amber, Flare = warm orange. No harsh red anywhere. This is a
  kind tool for someone looking at her own skin, and the wording should be gentle too.
- **Type (decided by Anvi):** **Instrument Serif Regular** for headings and **Inconsolata Medium** (weight 500) for all body text.
  - Headings: month titles, screen titles, the date numeral on photos, and the big streak number.
  - Body, buttons, labels, tiles, pills and the nav: Inconsolata Medium. Uppercase micro-labels use the same font with
    wider letter-spacing (about 0.08em) and a smaller size.
  - Instrument Serif only comes in Regular and Italic, and Inconsolata is monospace. So build hierarchy with **size, spacing and colour, not bold weight**.
    Set `font-synthesis: none` so the browser never fakes a bold. Check that body text stays comfortable to read at 14 to 16px
    and use `font-variant-numeric: tabular-nums` for dates and counts.
  - **Bundle the font files locally** (download the OFL-licensed `.woff2` files and add them with `@font-face`, using `font-display: swap`).
    Do not load fonts from Google Fonts or any CDN, because that would be a network call. Add a serif and a monospace fallback in the font stack.
- **Numerals:** the streak number is the hero, around 96px or more, in Instrument Serif Regular with slightly tight tracking (about -0.02em).
- **Hero gradient (decided by Anvi):** the top part of the Today screen (roughly the top 40%) uses `--hero-gradient`.
  Add a fine **film-grain texture** on top, as in her sunset reference: an inline SVG `feTurbulence` noise as a CSS
  background at about 20 to 30% opacity (inline data URI, so no network request). A white sheet with rounded top corners
  rises over the bottom of the gradient and holds the streak number and tiles. Dark ink text reads well on every stop of the gradient.
  Do not put white text on it. Do not use the gradient behind long text or on the Album screen; keep those white.
- **Motion:** gentle and short. Respect `prefers-reduced-motion`.
- **No emoji** in the UI. Use simple line icons (inline SVG).
- **Accessibility:** colour is never the only signal for status, so add a small label or icon. Keep text contrast readable on the pastel fills.

## 8. Technical requirements

- Keep it **vanilla HTML, CSS and JavaScript**, no framework and no build step, unless Anvi asks otherwise. It keeps the learning surface small.
- Mobile first at 390px wide, comfortable up to a desktop window. Use `100dvh` and `env(safe-area-inset-*)`.
- Storage stays **IndexedDB**. Schema changes require a version bump and a tested migration. Never lose existing photos.
- Data model (version 2):
  ```
  entries (key: date "YYYY-MM-DD")
    date, photo (Blob), thumb (Blob), takenAt (ms), status ("clear"|"some"|"flare"|null)
  meta (key/value)
    startDate, ...
  ```
- Dates are local-time strings. Be careful with midnight, time zones and daylight changes.
- Keep `dates.js` testable in Node. Add tests with `node --test` for streak logic and the migration.
- Performance: album uses thumbnails and lazy loads. Revoke object URLs when done.
- Offline: service worker caches the app shell only. Photos are never cached anywhere except IndexedDB.

## 9. Privacy and safety requirements

- **No network calls with user data, ever.** No analytics, no third-party scripts, no CDN fonts, no error reporters.
- Make this checkable: Claude Code should confirm in DevTools (Network tab) that loading and saving a photo makes zero requests beyond the app's own static files.
- The settings screen states plainly that photos stay on this device, and warns that clearing browser data deletes them unless she has exported a backup.
- Face photos are sensitive. Do not commit any test photos of Anvi to git. Use generated placeholder images for testing, and add a sensible `.gitignore`.
- Do not present anything as medical advice or a skin score.

## 10. Working agreement and learning plan (put the essentials in `CLAUDE.md`)

`CLAUDE.md` should say: Anvi is a beginner; explain in plain language; photos stay on-device; keep it
vanilla JS; commit after each working step; ask before adding any dependency; never add network calls.

Suggested learning path. Use each tool when it fits the phase and say briefly what it is for.
Do not use a tool just to tick a box.

| When | Tool or habit | What she learns |
|---|---|---|
| Phase 0 | Plan mode (cycle modes with Shift+Tab), `/init`, `CLAUDE.md` | Plan before code; how Claude Code remembers a project |
| Phase 0 | Git and GitHub, small commits | Saving progress and undoing mistakes |
| Phase 0 | Static hosting (GitHub Pages or Netlify) | How a web app reaches a phone |
| Every phase | `/clear` between phases, `/compact` in long sessions | Managing context |
| Phase 1 to 2 | Browser preview or a Playwright MCP server to screenshot the app | Letting Claude see its own UI and compare against her references |
| Phase 1 to 3 | The `frontend-design` skill | How skills change design quality |
| Phase 2 to 4 | `node --test` for streak logic and migrations | Why tests protect data |
| Phase 4 | Chrome DevTools, Lighthouse PWA audit, Application tab | How to inspect storage and installability |
| Later | A custom slash command or a hook (for example, run tests before each commit) | Automating her own workflow |

## 11. Success criteria

- She uses it for **14 days in a row** without friction.
- Taking today's photo takes under 10 seconds from opening the app.
- A year of photos opens the album in under 2 seconds on her phone.
- Export then import restores everything exactly.
- Network tab shows no outside requests.
- She says it looks like something she designed.

## 12. Risks and open questions

- **iOS storage limits.** Safari may evict site data for sites not used for a while, which is why backup and install-to-home-screen matter.
- **Reminders.** Web push on iOS needs the app installed to the home screen and has limits. Verify before promising it.
- **Camera guide overlay** needs a live camera stream, so it changes the capture flow. Keep it as a stretch.
- **Naming.** "Skin Tracker" is a placeholder. Ask her.
- **Palette.** v2 is set (blue hero). If something looks off on a real phone screen, adjust tokens in one place and ask Anvi.

---

## Appendix: first prompt to paste into Claude Code

> Read PRD.md and the five existing files. Stay in plan mode. First ask me the Open decision question.
> Then propose Phase 0 and Phase 1 as small steps and explain each in plain language before you change anything.
> Do Phase 0 first. Stop after each phase and wait for me.
