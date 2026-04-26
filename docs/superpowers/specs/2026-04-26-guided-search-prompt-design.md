# Guided Search + Prompt Compaction

**Date:** 2026-04-26
**Scope:** `src/playtomic_agent/web/agent.py` — `_build_system_prompt()`

## Problem

The system prompt has grown to ~400 words and lacks a clear guided-search flow. When a user says "find me a court", the agent either fires `handoff_to_find` immediately (often with empty params) or asks several questions at once. The result is a Find Mode panel that opens half-empty.

## Goal

1. Compact the prompt to ~180 words.
2. Add a one-question-at-a-time collection sequence before any slot search.

## Guided Search Flow

Before calling any search tool the agent collects the following in order — **one question per reply**:

| Step | Criterion | Behaviour |
|------|-----------|-----------|
| 1 | Club | Always ask/confirm, even if `preferred_club_name` is in profile |
| 2 | Date or date range | Always ask/confirm |
| 3 | Time window | Always ask/confirm |
| 4 | Duration + court type | Optional — if user says "doesn't matter" or skips, proceed without |

Once club + date + time are collected:
- **Browse/explore intent** → call `handoff_to_find` with all collected params. Resolve relative dates ("this weekend", "next week") to ISO `YYYY-MM-DD`. Split `preferred_time` (e.g. `"18:00-21:00"`) into `time_from`/`time_to`. Do **not** send any follow-up message after the call.
- **Direct answer intent** ("just tell me what's free") → call `find_slots` (single date) or `find_slots_date_range` (multi-day, max 7 days).

## Prompt Structure (target ~180 words)

Five flat sections, no deep nesting:

```
{date/tz/lang header}

FIND A CLUB:
…

FIND SLOTS — collect in order, one question per reply:
1. Club (confirm even if in profile)
2. Date or date range (confirm even if implied)
3. Time window (confirm even if in profile)
4. Duration + court type (optional)
→ browse/explore: handoff_to_find (all params, resolved dates, no follow-up)
→ direct answer: find_slots / find_slots_date_range

RESULTS (>0 slots):
…

PREFERENCES:
…
```

## What Is Removed

- "NEVER construct links manually" — already enforced by tool return value
- "Ask to see more if needed" — handled by `suggest_next_steps`
- Redundant RULES section (only answer about Padel, never invent data) — collapsed into one header sentence
- Repeated sub-bullets explaining what each handoff param means (moved into tool `Annotated` descriptions)

## Out of Scope

- WhatsApp agent prompt (separate file, separate channel constraints)
- Tool schema changes (tool descriptions already updated in the previous session)
- Frontend changes
