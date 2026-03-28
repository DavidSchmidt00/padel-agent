# Settings Menu Redesign

**Date:** 2026-03-28
**Status:** Approved

## Problem

The existing header controls (RegionSelector dropdown + theme toggle pill) were replaced with a single `⋮` button that looked visually lost in the top-right corner. The button had no visual weight and communicated nothing about current state.

## Design Decisions

| Question | Decision | Rationale |
|---|---|---|
| Trigger style | ⚙️ gear icon button | More recognisable than ⋮; no content inflation like flag+icon pill |
| Menu structure | Dropdown panel with sections | Extensible — new sections (Profile, About, Imprint) are one block each |
| Region selector | Compact closed selector → scrollable open list | Scales to any number of regions; pills break at 4+ |
| Region list format | Flag + name + language code (e.g. 🇩🇪 Germany · Deutsch) | More informative than flag alone |
| Theme | Pill toggle + label inside Settings section | Reuses existing toggle, clearly labelled |
| Account section | Guest placeholder (dimmed, "Sign in coming soon") | Reserves the slot for WEB-2 auth without blocking this work |
| Links section | About + Imprint as plain text rows | Minimal; required for LEG-1 once pages exist |

## Component Structure

### Trigger button `.settings-toggle`

- Gear emoji `⚙️` centered in a styled button
- Height matches the mode tab buttons (Chat / Find) for visual consistency
- `border: 1.5px solid var(--border-input)`, `border-radius: 8px`
- Hover: `border-color: var(--accent)`

### Dropdown `.settings-dropdown`

Three sections separated by `border-top: 1px solid var(--border-color)`:

**1. Settings**
- Section label: `SETTINGS` (9px, uppercase, muted)
- **Region** sub-label + compact selector:
  - Closed: shows current region label + ▾ caret
  - Open: toggles an inline list of all regions (flag + name + language), active item highlighted with accent colour
  - Clicking a region closes the list and fires `onRegionChange`
- **Theme** sub-label + existing pill toggle + "Dark mode" / "Light mode" label

**2. Account**
- Section label: `ACCOUNT`
- Guest row: 👤 avatar circle + "Guest" name + "Sign in coming soon" sub-text
- Entire row is dimmed (`opacity: 0.5`) and non-interactive
- Replace with real user data when WEB-2 auth lands

**3. Links**
- `About` and `Imprint` as plain text rows
- Non-functional for now (no href yet); will link to pages from LEG-1

### Click-outside behaviour

Existing `useEffect` + `mousedown` listener on the wrapper ref closes the dropdown. Unchanged.

### Region sub-list open/close

A second local state `regionOpen: boolean` inside `SettingsMenu` controls whether the region list is expanded. Clicking the selector row toggles it. Selecting a region sets the value, closes the sub-list, and closes the main dropdown.

## File Changes

| File | Change |
|---|---|
| `web/src/components/SettingsMenu.jsx` | Replace ⋮ trigger with ⚙️; add Account + Links sections; replace region pills with compact selector |
| `web/src/styles.css` | Update `.settings-toggle` sizing; add `.settings-region-selector`, `.settings-region-list`, `.settings-region-list-item`, `.settings-account-row`, `.settings-link-row` |

`RegionSelector.jsx` is no longer imported anywhere and can be deleted.

## Out of Scope

- Actual About / Imprint pages (LEG-1)
- Real user auth / profile (WEB-2)
- Animation on region list open/close (can add later)
