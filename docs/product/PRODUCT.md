# Product Overview

## Modes

### Chat Mode
AI agent (LangGraph + Gemini/NVIDIA) answers natural language queries. The agent can search clubs, find slots, generate booking links, save user preferences, and suggest next steps via clickable chips. Results stream via SSE.

### Find Mode
Direct slot search without AI. The user picks clubs (autocomplete), date range, day-of-week + time windows, court type and duration. Results are grouped by date → time slot.

### Group Voting
Accessible from Find Mode after a search. The user selects candidate slots, a vote session is created (server-side, expires after N days), and a sharable link is generated. Each participant taps their available slots and submits their name. The admin can mark a slot as booked.

## User Profile

Preferences stored per-channel:
- `preferred_club_slug` / `preferred_club_name`
- `preferred_city`
- `court_type` (SINGLE / DOUBLE)
- `duration` (minutes)
- `preferred_time`

Web: `localStorage` key `padel-agent-profile`.
WhatsApp: `UserState.profile` in `data/whatsapp_users.db`.

## Presets (Find Mode)

Users can save named search presets (club + time windows + date offset) and reload them with one tap. Stored in `localStorage`.

## Regions

A region bundles country, language and timezone. The frontend ships a fixed list (`web/src/regions.js`). The selected region is sent with every API request; the backend uses it for timezone-aware slot display and for the AI agent's language/localisation.
