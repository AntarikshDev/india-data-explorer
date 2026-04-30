## Goal

Make every page feel like a native mobile app when opened on a phone browser or inside a WebView wrapper, while keeping the desktop experience intact.

## Problems Today

- **AppShell header**: horizontal nav scrolls off-screen on mobile (visible in screenshot — "Queue / Sets / Data Centre / Campaigns / History / Settings" overflow). No hamburger, no bottom tab bar.
- **Data Centre table**: 8 columns rendered with no horizontal scroll wrapper → page itself scrolls horizontally, breaking the layout (see screenshot).
- **Filters** on Data Centre / Queue use 7-column grid that collapses badly under 640px.
- **Edit Lead dialog** uses `max-w-lg` with no mobile-safe width clamp; 2-column form fields cramp on 375px.
- **Search page** Card padding `p-6` and headings `text-3xl` are desktop-tuned.
- **Sets / Campaigns / History / Settings** all use `max-w-4xl/2xl` containers and desktop spacing without mobile review.
- **No PWA / WebView polish**: no `theme-color`, no safe-area insets (iPhone notch / home indicator), no `apple-mobile-web-app-capable`, no manifest, no app icon. Status bar shows white in screenshot.
- **Tap targets**: many `h-7` / `h-8` buttons below the 44px iOS minimum.
- **Modals** use desktop centred Dialog instead of bottom sheet on mobile (Drawer/Vaul is already installed).

## Plan

### 1. Mobile-first chrome (`src/components/AppShell.tsx`)

- Replace top-nav with a responsive shell:
  - **Mobile (`<md`)**: compact top bar (logo + sign-out icon) + **fixed bottom tab bar** with 5 primary destinations (Search, Queue, Sets, Data, More). Use icons + label, 56px tall, safe-area padding.
  - **"More" sheet** (Vaul Drawer) opens a list for Campaigns, History, Settings.
  - **Desktop (`md+`)**: keep current horizontal top nav.
- Add `pb-[calc(64px+env(safe-area-inset-bottom))]` to the main content on mobile so the bottom bar never covers content.
- Add `pt-[env(safe-area-inset-top)]` and `px-[env(safe-area-inset-left/right)]` where relevant.

### 2. PWA / WebView meta (`src/routes/__root.tsx`)

- Add to root `head()`:
  - `theme-color` matching primary (dark navy from the badge).
  - `apple-mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=black-translucent`.
  - `mobile-web-app-capable=yes`, `format-detection=telephone=yes`.
  - `viewport` updated to include `viewport-fit=cover` for safe-area support.
- Add `public/manifest.webmanifest` (name, short_name, theme/background colour, display=standalone, icons) and link it.
- Add a simple SVG/PNG `apple-touch-icon` in `public/`.

### 3. Responsive tables → card lists on mobile

For **Data Centre** (`src/routes/data.tsx`) and **History** lists:
- Wrap existing table in `<div className="hidden md:block overflow-x-auto">`.
- Add a `md:hidden` rendering that maps each row to a compact `Card`:
  - Line 1: name + score badge
  - Line 2: phone (mono) + source pill
  - Line 3: location · category (truncate)
  - Trailing chevron → opens edit drawer
- Filters: collapse 7-col grid into a single "Filters" trigger that opens a Vaul `Drawer` containing all selects on mobile; keep inline grid on `sm+`.

### 4. Mobile-friendly Edit Lead modal (`data.tsx`)

- On mobile, swap `Dialog` for `Drawer` (bottom sheet) with full-height-minus-top, internal scroll.
- Form: single column on mobile, 2-col on `sm+`.
- Inputs `h-10`, font-size 16px (prevents iOS zoom on focus) — adjust the shared `Input` to use `text-base` on mobile by default.

### 5. Queue page tuning (`src/routes/queue.tsx`)

- Filters card already 2-col on mobile but tap targets are `h-8`; bump to `h-10`.
- Move outcome modal from Dialog to bottom Drawer on mobile.
- Lead card: ensure action buttons row wraps to 2x2 grid under 360px and stays in single row otherwise.
- Today log + Help: open as bottom Drawer instead of Dialog.

### 6. Search page (`src/routes/index.tsx`)

- Reduce hero spacing on mobile (`text-2xl md:text-3xl`, `p-4 md:p-6`).
- Ensure Run button bottom margin clears the new bottom tab bar.
- Make `GeoPicker` selects stack on mobile.

### 7. Sets / Campaigns / History / Settings

- Convert their list rows to the same compact mobile card pattern.
- Use single-column forms on mobile (currently fine but verify spacing and 16px input font-size).
- Reduce title sizes and outer padding on mobile.

### 8. Global tokens & helpers

- Add a small `useIsMobile()` already exists — use it throughout.
- Add a `BottomSheet` wrapper around Vaul's Drawer for consistent styling.
- Add CSS in `src/styles.css`:
  ```text
  html, body { overscroll-behavior-y: none; }
  body { -webkit-tap-highlight-color: transparent; }
  @supports (padding: env(safe-area-inset-top)) {
    .safe-top { padding-top: env(safe-area-inset-top); }
    .safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
  }
  input, select, textarea { font-size: 16px; } /* prevents iOS zoom */
  ```

### 9. QA matrix

After implementation, manually verify on 375x812 (iPhone 12-mini), 390x844 (iPhone 14), 414x896, 768 (iPad), 1280 (desktop) for each route: no horizontal scroll, tap targets ≥ 44px, bottom bar doesn't cover CTAs, modals open as sheets on mobile.

## Out of Scope

- Building a real native iOS/Android wrapper (Capacitor) — this plan delivers a PWA-quality experience that will feel native inside any WebView.
- Offline / service worker caching.
- Push notifications.

## Files to Edit / Create

- Edit: `src/components/AppShell.tsx`, `src/routes/__root.tsx`, `src/routes/data.tsx`, `src/routes/queue.tsx`, `src/routes/index.tsx`, `src/routes/sets.tsx`, `src/routes/history.tsx`, `src/routes/settings.tsx`, `src/routes/campaigns.index.tsx`, `src/components/ui/input.tsx`, `src/styles.css`, `src/components/GeoPicker.tsx` (verify stacking).
- Create: `src/components/BottomNav.tsx`, `src/components/BottomSheet.tsx`, `public/manifest.webmanifest`, `public/apple-touch-icon.png` (or SVG).
