# Project Index — BBA Section H Organizer

Snapshot taken 2026-10-01, after the full implementation and verification pass.

## 1. What this project is

A single-file React app: a password-protected assignment tracker for one BBA class section (Section H, Fall 2026). No build step. The browser loads React, Tailwind and lucide-react from CDNs and Babel compiles the inline JSX at runtime.

## 2. Files

| Path | Role |
|---|---|
| [index.html](index.html) | The whole app, 3,465 lines: HTML shell, Tailwind config, import map, all React code. |
| [PROJECT_INDEX.md](PROJECT_INDEX.md) | This file. |
| [PLAN.md](PLAN.md) | The approved plan this work followed. |
| [.skills/anti-slop/SKILL.md](.skills/anti-slop/SKILL.md) | Fetched skill: AI-slop detection for text, code and design. |
| [.skills/anti-slop/design-patterns.md](.skills/anti-slop/design-patterns.md) | Fetched reference: visual and UX slop patterns. |
| [.skills/design-taste-frontend/SKILL.md](.skills/design-taste-frontend/SKILL.md) | Fetched skill: taste-skill v2, including its pre-flight checklist. |
| [.skills/ui-ux-pro-max/SKILL.md](.skills/ui-ux-pro-max/SKILL.md) | Fetched skill: UI/UX Pro Max, priority table and pre-delivery checks. |

`npx -y skills add …` could not run: this machine has no Node, npm or npx. The skills were fetched from their source repositories instead.

## 3. Runtime architecture

```
Google Fonts      Outfit (display) + Inter (body)
Tailwind 3.4.17   Play CDN, darkMode: "class", custom shadows and keyframes
<style>           base CSS: cursor rules, focus-visible ring, scrollbars, autofill, reduced motion
importmap         one React 18.3.1 instance shared by the app and lucide-react
Babel 7.25.6      compiles the inline JSX in the browser
```

## 4. Feature set

**Access and identity**
- **Accounts, not one shared password.** Everyone signs in with a username and password of their own. The first ever save grows a single `admin` account (password `admin`) so older installs keep working.
- **Self sign up with a class code.** The sign in screen has a Create account switch that asks for username, password and the class code. The code lives in the config, defaults to `SECTION-H`, and the admin can reveal it, change it or generate a fresh random one.
- Two roles: `admin` and `student`. Admins see the settings gear; students do not.
- **One shared class board.** Every signed in person sees every assignment, and each card shows who added it. Edit and delete appear only on your own cards, and on all cards for an admin.
- Any account can change its own password from the account chip in the header (name, role, change password, sign out). Admins can also manage everyone else in the Accounts tab: add, rename, promote or demote, reset a password, remove.
- Guards: the last admin cannot be demoted or removed, an account that still owns assignments cannot be removed, and usernames are unique regardless of capitalisation.
- Assignments saved before accounts existed are stamped with the admin on first load, so no card is ever left without a name.

**Board**
- Header, three stat tiles (Pending, In Progress, Completed) with counts and share of total.
- Search across title, subject, description and solution.
- Filters: subject, status, and a due row with All / Overdue / Due today / Next 7 days plus live counts.
- Responsive grid, 1 / 2 / 3 columns, sorted by due date.

**Tasks**
- Subject chip with a coloured dot, title, due date with relative wording, description, status button that cycles Pending → In Progress → Completed.
- Add and edit share one modal (edit reopens prefilled). The subject field is a type-anywhere input with suggestions: pick an existing subject or write a new name, and new names join the subject list automatically (case-insensitive reuse, whitespace trimmed, 60 character cap).
- **Submission never fails silently.** Required fields (Title, Subject, Due date, Description) carry a Required badge. On a failed submit the first missing field is scrolled into view and focused, and a summary above the buttons names what is still needed.
- Up to 6 pictures per assignment for the brief, and 6 more for the answer. Pick several files at once from the add form, the edit form or straight from a card. Thumbnails are numbered, removable one by one, and show an "n of 6" counter.
- Cards show up to 4 thumbnails (2 column grid, "+n more" badge) with an Add more pictures button underneath.
- Solution accordion: hidden behind View solution, with copy button and its own answer picture grid.
- Delete uses an inline confirm (second click inside 3.5 seconds).

**Picture pipeline**
- Every picked image is resized before storage: never upscaled, long edge capped at 1800px, shrunk in halves (progressive downscale with high-quality smoothing) instead of one big jump, then encoded as JPEG at falling quality steps (1800/0.9, 1400/0.86, 1100/0.82, 900/0.78) until the data URL fits its character budget.
- The first picture of a set gets the full budget (480,000 characters, about 360 KB). Extra pictures are encoded against a tighter 300,000 character budget so a full set still fits the browser store.
- Images that report no intrinsic size (some vectors) keep their original bytes instead of collapsing to one pixel.
- The lightbox has an Actual size / Fit to screen toggle (native pixels inside a scrollable figure) plus previous/next arrows and a "picture 2 of 3" counter when a set holds more than one.

**Subjects**
- Add, rename and delete. Renaming rewrites every task that used the old name. Subjects still in use cannot be deleted.
- Subject lists everywhere (form suggestions, filter select, settings) are sorted alphabetically.

**Data**
- Everything persists in localStorage.
- Settings has a Data tab: storage usage, JSON export, JSON import with a confirmation step and validation errors.

**Theme**
- Light, Dark or System, chosen with the header toggle, applied page-wide, persisted, and synced with `prefers-color-scheme`.

## 5. Data model

```js
// "bba-section-h-organizer.v1"
{ version: 1, items: [ { id, subject, title, description, solution, dueDate, status,
                        ownerId, ownerName, images, solutionImages, createdAt } ] }

// "bba-section-h-organizer.config.v1"
{ subjects: [...], theme: "light" | "dark" | "system", classCode: "SECTION-H",
  accounts: [ { id, username, password, role: "admin" | "student", createdAt, lastSeen } ] }

// role: "admin" (settings and every card) or "student" (shared board, own cards only)

// "bba-section-h-organizer.session.v1"
{ id: "<account id>", at: 1791009603160 }   // who is signed in, never a password

// status: "pending" | "in-progress" | "completed"   (cycles in that order)
// images / solutionImages: arrays of resized JPEG data URLs, up to 6 each
```

Subject options are the union of configured subjects and any subject already used by a task, so a rename or delete never orphans work silently. Typing a brand-new subject in the add or edit form adds it to the configured list on submit.

**Sign in.** Two gates, both on the same file. Students get `index.html`: sign in, or create an account with the class code. Admins get `index.html#admin` (also `?gate=admin`): a dark, admin only screen with no sign up, no class code, and no link to it from the student side. The gate refuses a student login and the student screen refuses an admin one, so a wrong door tells you which one to use and offers the other. The admin URL is visible in Settings, with a copy button, for the admin only.

The signed in person is kept in `bba-section-h-organizer.session.v1` under the same origin as the config, holding an account id and a timestamp, never a password. That is what makes a reload keep you signed in, and what the college quiz site reads and writes, so one login covers both sites.

Pictures moved from single `image` / `solutionImage` strings to arrays. `normaliseItem` accepts both shapes and `loadItems` runs it on every load, so existing saves and old backup files keep working without a manual migration step.

## 6. Skill-driven changes applied

- **Typography:** Outfit for headings, stat numbers and card titles; Inter for body. Ends the "Inter for everything" AI tell. Tabular figures on counts.
- **Colour lock:** emerald is the only accent. Subject chips are neutral with a coloured dot instead of eight tinted chip palettes.
- **Shape lock:** one documented radius scale (cards and modals 16px, controls 12px, chips and badges 8px).
- **Copy audit:** zero em-dashes in the file (verified with grep), no marketing filler, functional labels, error messages say what happened.
- **Accessibility:** `cursor: pointer` on interactive elements, a global `focus-visible` ring, labelled fields with `aria-invalid` and `aria-describedby`, focus trap in modals with focus restore, focus moved into the lightbox, `aria-controls` on the accordion, live regions on toasts, 40px and 44px minimum touch targets, contrast lifted on micro-copy.
- **Motion:** only motivated motion (card lift, accordion grid transition, toast slide), all clamped by `prefers-reduced-motion`.
- **Layout:** the empty picture slot moved out of the top of every card so titles lead; completed cards no longer repeat the status word twice. The modal overlay uses safe centring (`items-start` with `sm:items-center-safe`) because a form with pictures attached is taller than a short window, and plain centring clipped the top of the dialog out of reach.

## 7. Verified live, in the browser

Driven end to end and confirmed by DOM assertions plus screenshots:

1. Sign in screen rejects a wrong username or password ("That username and password do not match."), accepts the right one, and is case insensitive on the username ("ADMIN" worked). The old single password was migrated into a default `admin` account on first load.
2. Password change: wrong current password rejected, valid change saved, old password then fails, new one works, success message shown.
3. Subject add (persists), rename (rewrites the task), delete blocked while in use, delete allowed when unused.
4. Picture on a card: attach, thumbnail, view overlay, remove, storage updated at each step.
5. Picture in an answer: attach from the card, saved, view overlay replaces the attach button, lightbox remove clears it.
6. Edit: modal prefilled from the task, Save changes updates storage, modal closes.
7. Due chips: Next 7 days filters to 2, Overdue shows the empty state, All restores 7.
8. Theme: toggling cycles System → Light → Dark, applies the class, sets `color-scheme`, persists.
9. Export runs without error; import rejects bad JSON with a visible message and shows a confirmation panel for valid files (Cancel left data untouched).
10. Lock button returns to the lock screen with a toast.
11. Responsive at 375px: no horizontal overflow, touch targets at 40px and 44px.
12. Console clean apart from the expected Tailwind-CDN and Babel-CDN notices.
13. Image pipeline: a synthetic 3200×2000 PNG stored at 1800×1125 inside the character budget; a 220×140 image stored untouched (no upscaling); a 3000×1800 image re-checked at 1800×1080 after the subject-field changes.
14. Lightbox zoom: Actual size renders `max-w-none` inside a scrollable figure with `aria-pressed` on the toggle; Fit restores the contained view; close and remove still work.
15. Manual subject entry: submitting the add form with a typed new subject ("Cost Accounting") created the task, added the subject to the config and the filter select; editing with messy input ("  cost   accounting  ") reused the existing spelling without creating a duplicate.
16. Add form validation at 375px with the typeable subject input: no horizontal overflow, input wired to the suggestion list.
17. **Submit fix, measured:** on a 620px tall window with the form scrolled to the bottom, a failed submit now scrolls the dialog to the top of the form (dialog top at y=46 instead of y=-269), focuses the first missing field (`document.activeElement` is the Due date input), shows that field's message in view, and lists the missing fields above the buttons. Nothing is created.
18. **Multiple pictures:** three files picked at once rendered three numbered thumbnails with an "3 of 6 pictures" counter, two more on the answer with "2 of 6"; saving produced `images: 3, solutionImages: 2` with no legacy fields; the toast reported "Assignment added with 5 pictures".
19. **Card rendering:** 6 pictures showed a 2 column grid of 4 thumbnails plus a "+2 more" badge, and the "Add more pictures" button disappeared at the cap. At 375px the grid stayed 2 columns of 147px inside a 343px card with no overflow.
20. **Lightbox navigation:** opened on picture 2 of 3, ArrowRight reached 3 of 3 with Next disabled, ArrowLeft returned to 2 of 3, the on-screen arrow worked too, and "Remove picture" deleted the picture currently shown (3 became 2 on the card).
21. **Answer pictures:** accordion grid showed both answer shots with per-picture remove; removing answer picture 1 left one, relabelled "Answer picture 1".
22. **Cap and skip message:** with 5 pictures attached, picking 2 more added exactly 1, the toast said "1 picture added to the card, 1 skipped, the limit is 6", and the add button disappeared.
23. **Appending from a card:** two files dropped onto a card through the dashboard file input appended to the existing set (3 became 5) and the storage grew accordingly.
24. **Edit modal:** reopened showing all pictures with per-picture remove buttons and correct "2 of 6" / "1 of 6" counters; adding one more and saving persisted 3 pictures.
25. **Legacy migration:** an item hand-written into localStorage with the old `image` and `solutionImage` strings rendered as one brief thumbnail and one answer thumbnail after reload, and every stored item now carries array fields.
26. Cleanup after testing: back to 8 assignments and 6 KB of storage, with no test items left behind.

**Accounts pass (verified after the above):**

27. Migration: an existing config grew one `admin` account, and all 8 existing assignments were stamped with that owner (`ownerName: "admin"`) so no card was left unnamed.
28. Self sign up: a wrong class code was refused ("That class code is not right."), a lowercase correct code was accepted, and the new account was created with the `student` role, `lastSeen` stamped and the header chip reading "Signed in as Riya".
29. Shared board: the student saw all 9 assignments (8 existing plus the new one), and the admin gear was absent for a student.
30. Permissions: with a student signed in, 0 of 8 other people's cards offered Edit or Delete, while the card they added themselves did. Their new card stored `ownerName: "Riya"` and her account id.
31. Accounts tab: listed both accounts with role, assignment count and last seen; adding "Arjun" worked; a duplicate username ("riya") was refused; renaming to "Arjun K" worked; Remove was disabled with "still has 1 assignment(s)" for an account that owns work; an account with no assignments was removed; Make student was disabled for the only admin.
32. Class code: masked by default, revealed to `SECTION-H`, "New code" generated and persisted `H-UBV5V5`.
33. Passwords: an admin resetting a student's password persisted; the admin's own "My password" tab rejected a wrong current password, accepted a valid change, kept the session alive, and the old password then failed at sign in while the new one worked.
34. Account panel from the header chip: opens, shows name and role, and Sign out returns to the sign in screen with a "Signed out" toast.
35. Responsive at 375px: the sign in card is 333px wide with no horizontal overflow, the submit button is 43px tall, and register mode adds the class code field without overflow.
36. Cleanup: the test assignment, the test account and the generated code were all removed, leaving one `admin` account, class code `SECTION-H`, 8 assignments and 7 KB of storage.

**Admin gate and shared sign on (verified after the above):**

37. `index.html#admin` and `index.html?gate=admin` both open the admin gate on a cold load, with the "Admin gate" header strip, no sign up link and no class code field. The student screen is unchanged for everyone else.
38. Gate guards: an admin login typed on the student screen is refused with "Admin accounts unlock from the admin gate." and a button that opens the gate; a student login typed on the gate is refused with "That is a student login. Use the class sign in instead."; a wrong password on the gate says "That admin login is not correct." No session is written on any failure.
39. Session: signing in at the gate wrote `{"id":"a-mus0uskf-...","at":...}`, the dashboard opened, and a cold reload landed straight on the dashboard with no password prompt. Sign out cleared the key and returned to the student screen.
40. Admin gate link: Settings, Accounts shows the full URL for the current origin with a working Copy link button ("Admin gate link copied") and the note about which browser profile holds the data.
41. The quiz site shares the keys: 16 logic checks over `auth.js` passed (student sign in writes a session with no password in it, wrong password refused, admin account refused from the student chip, admin gate accepts the admin and refuses students, sign out clears the key, a corrupt or missing config degrades to an explanation instead of throwing, the storage watcher ignores unrelated keys).
42. Compile check: all six quiz sources (`App.jsx`, `auth.js`, `AccountChip.jsx`, `DiscordPanel.jsx`, `OrganizerLink.jsx`, `discord.js`) pass Babel with the React preset.

## 8. Remaining risks and honest limits

1. **Every password sits in localStorage in plain text.** That includes each person's. It keeps classmates out of casual view, not out of devtools.
2. **Accounts are per browser, and per origin.** There is no server, so the account list, the class code and the board live only in the device they were created on. A student who signs up on a phone and a laptop is two different sets of data, and classmates cannot see work submitted on another machine. Real shared access needs a backend.
3. **Two origins means two account sets.** The shared sign on works because the quiz site and `public/assignments.html` are served from the same origin. The standalone `index.html` opened from a different origin, a different port, or straight off disk is a separate set of data with its own `admin` / `admin` account. Sign in once on the origin you actually use and change that password.
4. **A session is a key in localStorage.** Anyone with devtools can point the session key at the admin account id and the organizer will open unlocked. It is a convenience, not a lock.
5. **localStorage is roughly 5 MB.** A single picture lands around 250 to 380 KB depending on detail, and the first picture in a set gets a larger budget than the rest. A picture heavy board (five or six photos on a few assignments) can fill the store; overflow surfaces a danger toast telling you to remove a picture, but older pictures are not evicted automatically. The Data tab shows current usage.
6. **Import replaces everything.** It confirms first and keeps the current password, but there is no undo.
7. **In-browser Babel.** Fine for daily use, not a production build. Moving to Vite needs Node, which this machine lacks.
8. **Preview screenshots lag** by a frame or two in this environment, so visual checks were repeated and DOM assertions were treated as authoritative.

## 9. Where things live in index.html

| Line | Block |
|---|---|
| 125 to 215 | Domain constants: class code default, keys, default subjects, dot colours, status meta, theme meta, role meta, due filters, required field order, picture cap |
| 217 to 330 | Sample assignments |
| 332 to 476 | Storage helpers and the session layer (account and config normalising, load, save and clear the session, gate detection, admin gate URL) |
| 478 to 707 | File helpers: usage text, dates, due buckets, image resize pipeline, backup download, JSON read, item normalising with legacy picture shapes |
| 709 to 840 | Shared class strings, `AmbientBackdrop`, `Field`, `Modal` with focus trap and safe centring |
| 842 to 990 | `AdminSignIn`, the admin gate behind `#admin` |
| 992 to 1177 | `SignInScreen` (sign in and self sign up with the class code, plus the hand off to the admin gate) |
| 1179 to 1314 | `AccountModal` (own password, sign out) |
| 1316 to 1374 | `StatCard`, `SelectControl`, `ThemeToggle` |
| 1376 to 1497 | `Lightbox` with Actual size toggle and set navigation |
| 1499 to 1813 | `copyText` helpers and `AssignmentCard` including both picture grids, the owner line and the solution accordion |
| 1815 to 1876 | `PictureGrid`, the shared picture picker |
| 1878 to 2207 | `TaskModal` (add and edit, typeable subject, multi picture pickers, submit feedback) |
| 2209 to 2214 | `makeClassCode` |
| 2216 to 2534 | `AccountsPanel` (class code, admin gate link, add account, rename, role, reset, remove) |
| 2536 to 2940 | `SettingsModal` (My password, Accounts, Subjects, Data) |
| 2942 to 2966 | `EmptyState` |
| 2968 to 3400 | `Dashboard` |
| 3402 to 3424 | `Toast` |
| 3426 to 3781 | `App` (gate state, session restore, account admin, board state) and bootstrap |

## 10. The college quiz site

`C:\Users\Krishna\Downloads\Compressed\college-quiz-app\college-quiz`

| File | What it does |
|---|---|
| `public/assignments.html` | Byte for byte copy of this app's `index.html`, served same origin as the quiz |
| `src/auth.js` | The shared sign on: reads and writes the same config and session keys, `signIn`, `signInAdmin`, `signOut`, `readSession`, `watchSession` |
| `src/AccountChip.jsx` | Bottom right chip on the quiz site: sign in, who you are, open assignments, sign out; live updates from other tabs |
| `src/OrganizerLink.jsx` | The Assignments pill in the top left corner |
| `src/App.jsx` | Renders the chip on the welcome, gender, quiz and success screens; the admin panel now asks for an admin username and password checked against the organizer accounts instead of a hardcoded password |
| `src/discord.js`, `src/DiscordPanel.jsx` | Discord webhook posting on start and finish, configured in the admin panel |

`SHARED_WEBHOOK_URL` in `src/discord.js` is still empty: paste the webhook there so every classmate's browser can post.
