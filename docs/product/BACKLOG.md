# Backlog

Items here are prioritised candidates for the "Next" phase. Each entry has acceptance criteria so an agent can pick it up without further clarification.

---

## UX

### Scroll to top after search (#121) ✅ done
**Acceptance:** `find-container` scrolls to top whenever new search results are rendered.

---

## Accessibility

### Bottom nav aria-labels (#130) ✅ done
**Acceptance:** All three bottom nav buttons carry a meaningful `aria-label` derived from i18n strings.

### Header home button focus ring (#131) ✅ done
**Acceptance:** `.header-home-btn:focus-visible` shows a 2px accent-coloured outline; mouse users unaffected.

---

## Tech Debt

### Remove dead Chat.jsx functions (#128) ✅ done
**Acceptance:** `sendPrompt` and `handleSuggestionClick` deleted; all existing behaviour unchanged.

### Extract shared vote-label util (#129) ✅ done
**Acceptance:** `web/src/utils/voteLabel.js` exported; FindMode, ProfilePage, VotePage all import it.

---

## Documentation

### Update docs (#92) ✅ done
**Acceptance:** README reflects current features; `docs/product/` stubs exist; AGENTS.md instructs continuous doc updates.

---

## Future Items (ungroomed)

- User accounts and sign-in
- Push notifications on vote resolution
- Group voting: expiry countdown
- Additional regions / languages
