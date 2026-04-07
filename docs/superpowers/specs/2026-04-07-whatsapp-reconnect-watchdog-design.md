# WhatsApp Reconnect Watchdog — Design

## Problem

When WhatsApp drops the connection for a permanent reason (e.g. `CLIENT_OUTDATED 405`), neonize fires `DisconnectedEv` but does **not** fire `ConnectFailureEv`. The existing `on_connect_failure` and `on_logged_out` handlers therefore never run, the process stays alive indefinitely with a dead socket, `WA_CONNECTED` stays `1`, and no messages are processed.

## Goal

Detect a failed reconnect attempt and exit cleanly so Railway restarts the service.

## Non-goals

- Updating the neonize dependency (separate concern)
- Deleting the session DB on exit (session is still valid; only the client version is rejected)
- Handling pairing timeouts (already covered by `_pairing_watchdog`)

---

## Design

### State variables (nonlocal inside `run_whatsapp_server`)

```
_reconnect_watchdog_task: asyncio.Task | None = None
```

### `on_disconnected` changes

When `_ready` is `True` (bot was fully live) and `DisconnectedEv` fires:

1. Set `_ready = False` — prevents stale messages from being processed on a dead socket.
2. Cancel any existing `_reconnect_watchdog_task` (handles rapid disconnect bursts).
3. Launch `asyncio.create_task(_reconnect_watchdog())` and store the reference.

The pairing-timeout branch (`_pairing_triggered and not _ready`) is unchanged.

### `_reconnect_watchdog` coroutine

```
async def _reconnect_watchdog(timeout_seconds: int = 60) -> None:
    await asyncio.sleep(timeout_seconds)
    # If we reach here, OfflineSyncCompletedEv never fired — reconnect failed.
    logger.error("Reconnect watchdog expired after %ds — exiting for restart", timeout_seconds)
    WA_FAILURES.labels(failure_type="transient").inc()
    await _fire_alert(
        event="reconnect_timeout",
        reason="watchdog_expired",
        message=f"WhatsApp reconnect did not complete within {timeout_seconds}s",
    )
    os._exit(1)
```

### `on_offline_sync_completed` changes

Before setting `_ready = True`, cancel and clear `_reconnect_watchdog_task` if set. This is always a no-op in the happy path (transient reconnects complete in <1 s).

---

## Behaviour by scenario

| Scenario | `DisconnectedEv` | `OfflineSyncCompletedEv` | Outcome |
|---|---|---|---|
| Transient EOF reconnect | fires → watchdog started | fires within ~1 s → watchdog cancelled | no change, normal operation |
| `CLIENT_OUTDATED` (or other permanent failure without `ConnectFailureEv`) | fires → watchdog started | never fires | watchdog expires after 60 s → alert + exit |

---

## Files changed

- `src/playtomic_agent/whatsapp/server.py` — `on_disconnected`, `on_offline_sync_completed`, new `_reconnect_watchdog` coroutine, new `_reconnect_watchdog_task` nonlocal variable

No new files, no schema changes, no dependency changes.

---

## Testing

- Existing tests: run full pytest suite; no changes expected.
- Manual verification: confirm that after a transient disconnect the watchdog is cancelled and the bot continues processing; confirm that a simulated permanent disconnect (mock `OfflineSyncCompletedEv` never firing) causes `os._exit(1)` after 60 s.
