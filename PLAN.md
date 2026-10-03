# Implementation Plan — BBA Section H Organizer

**Design read (taste-skill §0.B):** an internal productivity tool (assignment tracker) for one student, with a calm, premium utility language: Tailwind utilities, one emerald accent on slate neutrals, restrained feedback motion. Taste-skill explicitly declares dashboards / product UI out of scope (its §13), so this plan uses its universal craft rules (typography, colour lock, shape lock, copy audit, pre-flight) and takes interaction, accessibility and form rules from UI/UX Pro Max, plus anti-slop's design-pattern reference.

**Dials (reasoned, not baseline):** `DESIGN_VARIANCE 4` (utility product, not marketing page) · `MOTION_INTENSITY 3` (feedback-only motion, no scroll theatrics) · `VISUAL_DENSITY 6` (dashboard-ish, but cards need air).

## Phase 0 — Housekeeping (5 min)

- Delete `shot-lock.png` and `.chrome-prof/` (verification artifacts, not project files).
- Keep `.skills/` (fetched skills) and the two docs.

## Phase 1 — Verify what is already on disk (30 min)

Everything below is already coded; it needs to be driven end to end and fixed if it breaks.

1. **Pictures.** Upload via the add modal and via the card's "Add picture" slot; thumbnail renders; lightbox opens/removes/closes on Escape; remove works from card hover; picture survives a reload.
2. **Admin password change.** Settings opens from the header gear; wrong current password is rejected; valid change saves; after lock, old password fails and the new one works; reload keeps the new password. (Test with a temp password, then restore `admin`.)
3. **Subject management.** Add a subject (appears in picker + filters, persists); rename a subject (tasks with the old name update); delete is blocked while a subject is in use and allowed once unused.
4. **Regression sweep.** Search, filters, status cycling + toast, delete confirm, add validation, accordion, empty states, body-scroll restore after closing modals.

## Phase 2 — Skill-driven design and a11y pass (the bulk)

### 2A. Accessibility and interaction (UI/UX Pro Max priorities 1–2, CRITICAL)

- Base rule: `button:not(:disabled), select, summary { cursor: pointer }` (pro-max pre-delivery checklist).
- Visible keyboard focus on every interactive element: shared `focus-visible` ring (emerald, 2px, offset). No control may keep `focus:outline-none` without a replacement.
- Touch targets: status toggle and small icon buttons reach 40–44px on touch; keep visual compactness via padding, not shrinking.
- Toasts: `role="status" aria-live="polite"` (danger toasts `role="alert"`).
- Modals: real focus trap, focus returns to the triggering button on close, `aria-labelledby` wired to the title.
- Contrast bumps: meaningful `text-slate-400` micro-copy to `text-slate-500`+; input placeholders to `slate-500`; verify emerald-600-on-white and white-on-emerald-600 pass AA (they do).
- Accordion gets `aria-controls` + panel `id`; lightbox traps focus.

### 2B. Visual system (taste-skill §4.1–4.4 + anti-slop design patterns)

- **Typography:** break the "Inter for everything" tell. Display face for headings, stat numbers and brand: **Outfit** (Google Fonts, weights 500–700). Inter stays for body/UI text. Tabular figures (`font-variant-numeric: tabular-nums`) for stat counts. Two families, clear hierarchy, no serif (serif discipline respected).
- **Colour consistency lock:** emerald is the single accent. Subject chips stop being an 8-hue rainbow: neutral `slate-50` chip + one small coloured dot per subject (keeps scanning, kills the palette noise). Status colours (amber/sky/emerald) remain because they are semantic, not decorative.
- **Shape consistency lock:** one documented radius scale, applied everywhere: cards + modals `rounded-2xl` (16px), controls (buttons, inputs, selects) `rounded-xl` (12px), chips/badges `rounded-lg` (8px). Audit and fix outliers.
- **Shadows:** already slate-tinted (`shadow-card`, `shadow-lift`); confirm no pure-black shadows and shadows stay consistent on hover states.
- **Motion:** motivated only — card lift on hover (affordance), toast slide (feedback), accordion grid-rows transition (state change), icon spin on in-progress hover (state cue). All under the existing `prefers-reduced-motion` clamp.

### 2C. Copy audit (anti-slop text rules + taste §4.9)

- Zero em-dashes on the page (taste pre-flight is absolute). Rewrite seed solutions and UI strings that use "—".
- Re-read every visible string; fix vague or cutesy ones. Candidates: "tap status to change" → clearer hint, footer line tightened, empty states get next-step actions (already do).
- No buzzwords, no fake-precise numbers in UI chrome.

## Phase 3 — Re-verify and pre-flight

1. Full flow matrix again in the preview browser at 375 / 768 / 1024 / 1440 px.
2. Console must stay clean; screenshots re-taken for lock, dashboard, card with picture, lightbox, both settings tabs, modal validation.
3. Run both checklists and report honestly:
   - taste-skill §14 pre-flight (theme lock, colour lock, shape lock, button contrast, CTA wrap, copy self-audit, motion-motivated, empty/loading/error states, no AI tells)
   - UI/UX Pro Max pre-delivery items relevant to web (icons not emoji, cursor-pointer, interaction timing, contrast 4.5:1, focus states, reduced motion, text reflow, responsive at 4 widths)
4. Update `PROJECT_INDEX.md` to reflect the new state.

## Phase 4 — Optional extras (only if you want them)

- **Export / import JSON** backup button in settings (protects against localStorage wipes).
- **Edit assignment** (reopen the add modal prefilled; update instead of insert).
- **"Due soon" quick filters** (Today / This week chips next to the search bar).
- **Dark mode** as a full second theme (page-level lock, never mixed; `prefers-color-scheme` or a toggle).
- **Move pictures to IndexedDB** so the 5 MB localStorage quota stops being a ceiling.
- **Vite build** for production (needs Node, which this machine lacks; would be deliverable as a project you can run elsewhere).

## Constraints and risks

- No Node on this machine: the app stays CDN + in-browser Babel. Fine for use, not for production hardening.
- localStorage ~5 MB quota; pictures are compressed (1400px, JPEG 0.82) at roughly 150–300 KB each. Overflow already surfaces a danger toast; Phase 4 offers the real fix.
- Password change is client-side only; nothing here is real security, it is a privacy screen.
- The preview panel's screenshots lag one frame, so verification leans on DOM assertions plus repeated screenshots.

## Definition of done

All Phase 1 flows pass live, every Phase 2 checklist item is either fixed or explicitly waived with a reason, both checklists report green on the items that apply, console is clean, and the app still loads locked with the password you chose.
