import asyncio
import hashlib
import hmac
import json
import logging
import os
from collections import defaultdict
from datetime import date as _date
from datetime import datetime as _datetime
from datetime import timedelta
from pathlib import Path
from typing import Literal
from urllib.parse import parse_qs
from urllib.parse import urlparse as _urlparse
from zoneinfo import ZoneInfo

import httpx
import requests
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel, Field, field_validator, model_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from playtomic_agent.client.api import PlaytomicClient
from playtomic_agent.client.exceptions import APIError, ClubNotFoundError
from playtomic_agent.config import get_settings
from playtomic_agent.context import get_timezone, set_request_region, truncate_history
from playtomic_agent.metrics import (
    VOTES_CREATED,
    WEB_MESSAGES,
    WEB_PAGE_VIEWS,
    UsageCallbackHandler,
)
from playtomic_agent.web.agent import create_playtomic_agent
from playtomic_agent.web.vote_store import InvalidSlotError as _InvalidSlotError
from playtomic_agent.web.vote_store import SessionNotFoundError as _SessionNotFoundError
from playtomic_agent.web.vote_store import VoteSlot as _VoteSlot
from playtomic_agent.web.vote_store import VoteStore

logger = logging.getLogger(__name__)

app = FastAPI(title="Playtomic Agent API")


@app.get("/metrics", include_in_schema=False)
async def metrics_endpoint():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


_vote_store: VoteStore | None = None


def _get_vote_store() -> VoteStore:
    global _vote_store
    if _vote_store is None:
        _vote_store = VoteStore(db_path=Path(get_settings().votes_db_path))
    return _vote_store


# Setup Rate Limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# Allow local frontend dev server access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static assets if the directory exists (Production mode)
# This assumes the frontend build is copied to /app/static in the Docker image
STATIC_DIR = os.environ.get("STATIC_DIR", "/app/static")
if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=f"{STATIC_DIR}/assets"), name="assets")


@app.get("/health")
async def health_check():
    """Health check endpoint for Railway."""
    return {"status": "ok"}


class ChatRequest(BaseModel):
    prompt: str | None = Field(default=None, max_length=4000)
    messages: list[dict] | None = Field(default=None, max_length=40)
    user_profile: dict | None = None
    # Region settings (from frontend region selector)
    country: str | None = None
    language: str | None = None
    timezone: str | None = None


class ProfileSuggestion(BaseModel):
    key: str
    value: str


class ChatResponse(BaseModel):
    text: str
    profile_suggestions: list[ProfileSuggestion] | None = None


class TimeWindow(BaseModel):
    days: list[int]  # 0=Mon … 6=Sun
    start: str  # HH:MM
    end: str  # HH:MM


class SearchRequest(BaseModel):
    club_slugs: list[str] = Field(min_length=1)
    club_names: list[str] = []  # parallel to club_slugs; used as display label in results
    date_from: str
    date_to: str
    time_windows: list[TimeWindow] = Field(min_length=1)
    duration: int | None = None
    court_type: Literal["SINGLE", "DOUBLE"] | None = None
    timezone: str | None = None
    language: str | None = None
    country: str | None = None

    @model_validator(mode="after")
    def _validate_limits(self) -> "SearchRequest":
        settings = get_settings()
        if len(self.club_slugs) > settings.search_max_clubs:
            raise ValueError(
                f"Too many clubs: max {settings.search_max_clubs}, got {len(self.club_slugs)}."
            )
        if len(self.time_windows) > settings.search_max_time_windows:
            raise ValueError(
                f"Too many time windows: max {settings.search_max_time_windows},"
                f" got {len(self.time_windows)}."
            )
        try:
            d_from = _date.fromisoformat(self.date_from)
            d_to = _date.fromisoformat(self.date_to)
        except ValueError as exc:
            raise ValueError(f"Invalid date format: {exc}") from exc
        span = (d_to - d_from).days
        if span < 0:
            raise ValueError("date_to must be >= date_from")
        if span > settings.search_max_date_span_days:
            raise ValueError(
                f"Date range too large: max {settings.search_max_date_span_days} days, got {span}."
            )
        return self


class SlotResult(BaseModel):
    date: str  # YYYY-MM-DD
    local_time: str  # HH:MM
    court: str
    duration: int
    price: str
    booking_link: str
    court_type: str | None = None  # "SINGLE" | "DOUBLE" — propagated from SearchRequest
    club_name: str = ""


class CreateVoteRequest(BaseModel):
    slots: list[_VoteSlot]
    metadata: dict | None = None


class SlotVoteInput(BaseModel):
    slot_id: str
    can_attend: bool


class CastVoteRequest(BaseModel):
    voter_name: str
    votes: list[SlotVoteInput]  # per-slot availability

    @field_validator("voter_name")
    @classmethod
    def voter_name_not_blank(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("voter_name must not be blank")
        return stripped


class SearchResponse(BaseModel):
    results: list[SlotResult]
    total_count: int
    dates_checked: int
    error: str | None = None


class ClubResult(BaseModel):
    name: str
    slug: str


def _extract_text(m) -> str | None:
    """Extract text content from various message formats."""
    # Try content_blocks first (LangChain AIMessage-like)
    try:
        cbs = getattr(m, "content_blocks", None)
        if cbs:
            for cb in cbs:
                t = getattr(cb, "text", None)
                if t:
                    return str(t)
    except Exception:
        pass

    # Try content (string or list of dicts)
    try:
        content = getattr(m, "content", None)
        if isinstance(content, str):
            return content
        elif isinstance(content, list | tuple):
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text" and item.get("text"):
                    return item.get("text")
    except Exception:
        pass

    return None


def _map_exception_to_error(exc: Exception) -> dict:
    """Map exceptions to standard error codes and friendly messages."""
    msg = str(exc)

    # 1. Network / Connection Errors
    if isinstance(exc, (httpx.ConnectError, httpx.NetworkError, OSError, ConnectionError)):
        return {
            "code": "NETWORK_ERROR",
            "message": "Network connection lost. Please check your internet connection.",
            "detail": msg,
        }

    # 2. Rate Limits — check by type first, fall back to status-code string for SDK wrappers
    if (
        isinstance(exc, RateLimitExceeded)
        or "ResourceExhausted" in msg
        or (isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 429)
    ):
        return {
            "code": "RATE_LIMIT_ERROR",
            "message": "I'm receiving too many requests right now. Please try again in a minute.",
            "detail": msg,
        }

    # 3. Recursion Limit (LangGraph agent stuck in loop)
    if isinstance(exc, RecursionError) or "recursion limit" in msg.lower():
        return {
            "code": "RECURSION_LIMIT_ERROR",
            "message": "I thought about this for too long and got stuck. Please try rephrasing your request.",
            "detail": msg,
        }

    # 4. JSON Parsing Errors
    if isinstance(exc, (ValueError, json.JSONDecodeError)) and "json" in msg.lower():
        return {
            "code": "PARSING_ERROR",
            "message": "I couldn't understand the server response. Please try again.",
            "detail": msg,
        }

    # Default: Internal Error
    return {
        "code": "INTERNAL_SERVER_ERROR",
        "message": "Something went wrong. Please try again later.",
        "detail": msg,
    }


@app.post("/api/chat")
@limiter.limit("100/day")
async def chat(req: ChatRequest, request: Request):  # Added request param for limiter
    """Accept a prompt, run the agent, and stream events via SSE.

    Events:
    - tool_start: {"tool": "name", "input": "..."}
    - tool_end: {"tool": "name", "output": "..."}
    - message: {"text": "final response"}
    - profile_suggestion: {"key": "...", "value": "..."}
    - error: {"detail": "..."}
    """
    WEB_MESSAGES.inc()

    # Prepare input
    if req.messages:
        messages = [{"role": m["role"], "content": m["content"]} for m in req.messages]
    elif req.prompt:
        messages = [{"role": "user", "content": req.prompt}]
    else:
        raise HTTPException(
            status_code=400, detail="Either 'prompt' or 'messages' must be provided."
        )

    messages = truncate_history(messages)

    # Set context
    set_request_region(
        country=req.country,
        language=req.language,
        timezone=req.timezone,
    )

    agent = create_playtomic_agent(req.user_profile, language=req.language)

    async def stream_agent_events():
        try:
            logging.debug(f"Starting agent stream with profile: {req.user_profile}")

            # Use "updates" mode to get each step of the graph
            _usage = UsageCallbackHandler(channel="web")
            async for chunk in agent.astream(
                {"messages": messages},
                stream_mode="updates",
                config={"recursion_limit": 30, "callbacks": [_usage]},  # type: ignore[arg-type]
            ):
                for step, data in chunk.items():
                    logging.debug(f"Agent Step: {step}")

                    for m in data.get("messages", []):
                        # 1. Check for Tool Calls (Tool Start)
                        if getattr(m, "tool_calls", None):
                            for tc in m.tool_calls:
                                event = {
                                    "type": "tool_start",
                                    "tool": tc.get("name"),
                                    # "input" turned out to cause JSON parsing issues on frontend if it contains quotes
                                }
                                yield f"data: {json.dumps(event)}\n\n"
                                await asyncio.sleep(0.01)  # Force flush
                                logging.debug(f"Stream yielded tool_start: {tc.get('name')}")

                                if tc.get("name") == "suggest_next_steps":
                                    try:
                                        args = tc.get("args", {})
                                        if "options" in args and isinstance(args["options"], list):
                                            chip_event = {
                                                "type": "suggestion_chips",
                                                "options": args["options"],
                                            }
                                            yield f"data: {json.dumps(chip_event)}\n\n"
                                            await asyncio.sleep(0.01)
                                            logging.info(
                                                f"Stream yielded suggestion_chips: {args['options']}"
                                            )
                                    except Exception as e:
                                        logging.error(f"Failed to parse suggestions: {e}")

                                if tc.get("name") == "handoff_to_find":
                                    args = tc.get("args", {})
                                    try:
                                        payload = json.dumps(
                                            {"type": "find_handoff", "params": args}
                                        )
                                    except TypeError:
                                        logging.exception(
                                            "Failed to serialise find_handoff args: %r", args
                                        )
                                    else:
                                        yield f"data: {payload}\n\n"
                                        await asyncio.sleep(0.01)
                                        logging.info("Stream yielded find_handoff: %r", args)

                        # 2. Check for Tool Output (Tool End) & Profile Updates
                        if getattr(m, "tool_call_id", None) is not None:
                            tool_name = getattr(m, "name", "unknown")
                            content = getattr(m, "content", "")

                            # Check for profile update
                            if tool_name == "update_user_profile":
                                try:
                                    # Content might be stringified JSON
                                    parsed = (
                                        json.loads(content) if isinstance(content, str) else content
                                    )
                                    if isinstance(parsed, dict) and "profile_update" in parsed:
                                        update = parsed["profile_update"]
                                        event = {
                                            "type": "profile_suggestion",
                                            "key": update["key"],
                                            "value": update["value"],
                                        }
                                        yield f"data: {json.dumps(event)}\n\n"
                                        await asyncio.sleep(0.01)  # Force flush
                                        logging.info(f"Stream yielded profile_suggestion: {update}")
                                except Exception:
                                    pass

                            # Emit generic tool end
                            event = {
                                "type": "tool_end",
                                "tool": tool_name,
                                "output": str(content)[:200],  # truncate for log/stream
                            }
                            yield f"data: {json.dumps(event)}\n\n"
                            await asyncio.sleep(0.01)  # Force flush
                            logging.debug(f"Stream yielded tool_end: {tool_name}")

                            # Check for suggestion chips
                            if tool_name == "suggest_next_steps":
                                try:
                                    # Content might be stringified JSON or the return string
                                    # Since tool returns a string, we need to grab the input args to see what options were passed
                                    # But wait, we are in tool_end (output). We need the inputs?
                                    # Actually, langchain graph state stores messages.
                                    # The tool CALL has the args. The tool OUTPUT is just "Suggestions sent".
                                    # We can capture the tool call arguments from the ToolMessage? No, ToolMessage only has artifact/content.
                                    # We need to look at the corresponding AIMessage that called the tool.
                                    # BUT, simpler: in `tool_start` we have the input! Can we emit it then?
                                    # No, let's keep it simple. We can parse the input in `tool_start` or just rely on the fact that
                                    # we are processing the tool execution.
                                    # Let's look at `tool_start` above. It has `tc.get("args")`.
                                    pass
                                except Exception:
                                    pass

                        # 3. Check for Final Answer (Text)
                        # We only want the *final* assistant message, not intermediate tool calls
                        is_ai = (
                            m.__class__.__name__ == "AIMessage" or getattr(m, "type", "") == "ai"
                        )
                        if is_ai and not getattr(m, "tool_calls", None):
                            text = _extract_text(m)
                            if text:
                                event = {"type": "message", "text": text}
                                yield f"data: {json.dumps(event)}\n\n"
                                await asyncio.sleep(0.01)  # Force flush
                                logging.debug("Stream yielded final message")

        except Exception as exc:
            logging.exception("Agent stream failed")

            error_info = _map_exception_to_error(exc)

            error_event = {
                "type": "error",
                "code": error_info["code"],
                "message": error_info["message"],  # Fallback
                "detail": error_info["detail"],
            }

            yield f"data: {json.dumps(error_event)}\n\n"
            await asyncio.sleep(0.01)  # Force flush

    return StreamingResponse(stream_agent_events(), media_type="text/event-stream")


@app.get("/api/clubs")
@limiter.limit("60/minute")
async def search_clubs_endpoint(request: Request, q: str = "") -> list[ClubResult]:
    """Search for clubs by name. Returns matching clubs with name and slug."""
    if len(q) < 2:
        return []
    try:
        with PlaytomicClient() as client:
            clubs = client.search_clubs(query=q)
        return [ClubResult(name=c.name, slug=c.slug) for c in clubs]
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/search", response_model=SearchResponse)
@limiter.limit("20/minute")
async def search_slots(req: SearchRequest, request: Request):
    """Scan for available slots across a date range and time windows, bypassing the LLM."""
    # 1. Parse dates (validated by SearchRequest._validate_limits; needed as objects below)
    try:
        d_from = _date.fromisoformat(req.date_from)
        d_to = _date.fromisoformat(req.date_to)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid date format. Use YYYY-MM-DD.") from exc

    # 2. Set request context
    set_request_region(country=req.country, language=req.language, timezone=req.timezone)
    tz_str = get_timezone()

    # 3. Expand dates and build weekday → windows map
    all_dates = [d_from + timedelta(days=i) for i in range((d_to - d_from).days + 1)]
    window_by_day: dict[int, list[TimeWindow]] = defaultdict(list)
    for w in req.time_windows:
        for day in w.days:
            window_by_day[day].append(w)

    # 4. Scan each club × date × window combination
    results: list[SlotResult] = []
    dates_with_windows: set[str] = set()
    tz_zone = ZoneInfo(tz_str)

    try:
        with PlaytomicClient() as client:
            for i, club_slug in enumerate(req.club_slugs):
                club_name = req.club_names[i] if i < len(req.club_names) else club_slug
                for d in all_dates:
                    windows = window_by_day.get(d.weekday(), [])
                    if not windows:
                        continue
                    date_str = d.isoformat()
                    dates_with_windows.add(date_str)
                    for window in windows:
                        slots = client.find_slots(
                            club_slug=club_slug,
                            date=date_str,
                            court_type=req.court_type,
                            start_time=window.start,
                            end_time=window.end,
                            timezone=tz_str,
                            duration=req.duration,
                        )
                        for slot in slots:
                            local_dt = slot.time.astimezone(tz_zone)
                            results.append(
                                SlotResult(
                                    date=date_str,
                                    local_time=local_dt.strftime("%H:%M"),
                                    court=slot.court_name,
                                    duration=slot.duration,
                                    price=slot.price,
                                    booking_link=slot.get_link(),
                                    court_type=slot.court_type,
                                    club_name=club_name,
                                )
                            )
    except ClubNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    results.sort(key=lambda r: (r.date, r.local_time))
    return SearchResponse(
        results=results,
        total_count=len(results),
        dates_checked=len(dates_with_windows),
    )


@app.post("/api/votes", status_code=201)
async def create_vote_session(req: CreateVoteRequest, request: Request):
    """Create a shareable vote session from selected FindMode results."""
    vote_id = _get_vote_store().create(req.slots, metadata=req.metadata)
    # Skip web increment when called internally by the WhatsApp server — it
    # increments channel=whatsapp itself to avoid double-counting.
    if request.headers.get("X-Internal-Channel") != "whatsapp":
        VOTES_CREATED.labels(channel="web").inc()
    return {"vote_id": vote_id, "url": f"/vote/{vote_id}"}


def _parse_booking_link(link: str) -> dict | None:
    """Extract tenant_id, resource_id, UTC date/time and duration from a Playtomic booking link.

    The booking URL looks like:
        https://app.playtomic.com/payments?…&tenant_id=X&resource_id=Y&start=2026-05-18T08%3A00%3A00.000Z&duration=90
    parse_qs already URL-decodes values, so start arrives as "2026-05-18T08:00:00.000Z".
    """
    try:
        params = parse_qs(_urlparse(link).query)
        tenant_id = params.get("tenant_id", [None])[0]
        resource_id = params.get("resource_id", [None])[0]
        start_raw = params.get("start", [None])[0]
        duration_str = params.get("duration", [None])[0]
        if tenant_id is None or resource_id is None or start_raw is None or duration_str is None:
            return None
        # Normalise: strip milliseconds and replace Z with UTC offset
        start_clean = start_raw.replace("Z", "+00:00")
        if "." in start_clean:
            dot = start_clean.index(".")
            plus = start_clean.index("+", dot) if "+" in start_clean[dot:] else len(start_clean)
            start_clean = start_clean[:dot] + start_clean[plus:]
        start_dt = _datetime.fromisoformat(start_clean)
        return {
            "tenant_id": tenant_id,
            "resource_id": resource_id,
            "date": start_dt.strftime("%Y-%m-%d"),
            "start_time_utc": start_dt.strftime("%H:%M:%S"),
            "duration": int(duration_str),
        }
    except Exception:
        return None


def _check_slots_availability_sync(slots: list[dict], api_base_url: str) -> dict[str, bool | None]:
    """Synchronous Playtomic availability check — call via asyncio.to_thread."""
    result: dict[str, bool | None] = {}
    parsed_slots: list[tuple[str, dict]] = []

    for slot in slots:
        p = _parse_booking_link(slot.get("booking_link", ""))
        if p is None:
            result[slot["slot_id"]] = None
        else:
            parsed_slots.append((slot["slot_id"], p))

    # Group by (tenant_id, date) to minimise API calls
    groups: dict[tuple[str, str], list[tuple[str, dict]]] = defaultdict(list)
    for slot_id, p in parsed_slots:
        groups[(p["tenant_id"], p["date"])].append((slot_id, p))

    with PlaytomicClient(api_base_url=api_base_url) as client:
        for (tenant_id, date_str), group in groups.items():
            times = [p["start_time_utc"] for _, p in group]
            try:
                resp = client._request(
                    "availability",
                    params={
                        "tenant_id": tenant_id,
                        "date": date_str,
                        "sport_id": "PADEL",
                        "start_min": f"{date_str}T{min(times)}",
                        "start_max": f"{date_str}T{max(times)}",
                    },
                    timeout=10,
                )
                data = resp.json()
            except Exception:
                for slot_id, _ in group:
                    result[slot_id] = None
                continue

            # Build lookup: (resource_id, start_time_utc, duration) → available
            available: set[tuple[str, str, int]] = set()
            for res_avail in data:
                res_id = res_avail.get("resource_id", "")
                for s in res_avail.get("slots", []):
                    available.add((res_id, s.get("start_time", ""), int(s.get("duration", 0))))

            for slot_id, p in group:
                result[slot_id] = (
                    p["resource_id"],
                    p["start_time_utc"],
                    p["duration"],
                ) in available

    return result


@app.get("/api/votes/{vote_id}")
async def get_vote_session(vote_id: str):
    """Return current state of a vote session (slots + tally)."""
    session = _get_vote_store().get(vote_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Vote session not found or expired.")
    return session


@app.get("/api/votes/{vote_id}/availability")
@limiter.limit("20/minute")
async def get_vote_availability(vote_id: str, request: Request):
    """Check whether each slot in a vote session is still bookable on Playtomic.

    Booked slots (marked by the group) are excluded from the live check and
    returned with availability=None so the frontend shows the booked badge instead.
    """
    session = _get_vote_store().get(vote_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Vote session not found or expired.")

    booked: set[str] = set(session.get("booked_slots") or [])
    slots_to_check = [s for s in session["slots"] if s["slot_id"] not in booked]

    settings = get_settings()
    try:
        availability = await asyncio.to_thread(
            _check_slots_availability_sync,
            slots_to_check,
            settings.playtomic_api_base_url,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Booked slots are returned as None — frontend treats them separately
    for slot_id in booked:
        availability[slot_id] = None
    return {"availability": availability}


@app.post("/api/votes/{vote_id}/slots/{slot_id}/book", status_code=200)
async def mark_slot_booked(vote_id: str, slot_id: str):
    """Mark a slot as booked by the group. Visible to everyone with the link."""
    store = _get_vote_store()
    session = store.get(vote_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Vote session not found or expired.")
    valid_ids = {s["slot_id"] for s in session["slots"]}
    if slot_id not in valid_ids:
        raise HTTPException(status_code=422, detail="Unknown slot_id.")
    store.mark_booked(vote_id, slot_id)
    updated = store.get(vote_id)
    return {"booked_slots": (updated or {}).get("booked_slots", [])}


@app.delete("/api/votes/{vote_id}/slots/{slot_id}/book", status_code=200)
async def unmark_slot_booked(vote_id: str, slot_id: str):
    """Remove the booked flag from a slot (organiser undo)."""
    store = _get_vote_store()
    session = store.get(vote_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Vote session not found or expired.")
    valid_ids = {s["slot_id"] for s in session["slots"]}
    if slot_id not in valid_ids:
        raise HTTPException(status_code=422, detail="Unknown slot_id.")
    store.unmark_booked(vote_id, slot_id)
    updated = store.get(vote_id)
    return {"booked_slots": (updated or {}).get("booked_slots", [])}


def _sign_webhook_payload(payload: dict, secret: str) -> str:
    """Return HMAC-SHA256 hex digest of the JSON-serialised payload."""
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


def _fire_webhook(url: str, payload: dict) -> None:
    # Serialize with the same settings used by _sign_webhook_payload so the
    # raw body the receiver hashes matches what was signed here.
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    headers: dict[str, str] = {"Content-Type": "application/json"}
    secret = get_settings().webhook_secret
    if secret:
        headers["X-Webhook-Signature"] = f"sha256={_sign_webhook_payload(payload, secret)}"
    try:
        requests.post(url, data=body, headers=headers, timeout=5)
    except Exception as exc:
        logger.error(f"Failed to fire webhook {url}: {exc}")


@app.post("/api/votes/{vote_id}/vote")
async def cast_vote(vote_id: str, req: CastVoteRequest, background_tasks: BackgroundTasks):
    """Record per-slot availability for a voter."""
    votes_dict = {v.slot_id: v.can_attend for v in req.votes}
    vote_store = _get_vote_store()
    try:
        session = vote_store.record_vote(vote_id, req.voter_name, votes_dict)
    except _SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except _InvalidSlotError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Task 6: Trigger Webhook from Web API
    metadata = session.get("metadata") or {}
    notified_slots = set(session.get("notified_slots") or [])
    group_jid = metadata.get("group_jid")

    if group_jid:
        _settings = get_settings()
        webhook_url = _settings.whatsapp_webhook_url
        for sid, count in session["tally"].items():
            slot_info = next((s for s in session["slots"] if s["slot_id"] == sid), None)
            slot_threshold = (
                _settings.single_court_vote_threshold
                if slot_info and slot_info.get("court_type") == "SINGLE"
                else _settings.double_court_vote_threshold
            )
            if count >= slot_threshold and sid not in notified_slots:
                if slot_info:
                    vote_store.mark_notified(vote_id, sid)
                    notified_slots.add(sid)

                    payload = {
                        "vote_id": vote_id,
                        "group_jid": group_jid,
                        "display": f"{slot_info.get('date')} {slot_info.get('local_time')} ({slot_info.get('duration')}m)",
                        "booking_link": slot_info.get("booking_link"),
                        "voter_count": count,
                    }
                    background_tasks.add_task(_fire_webhook, webhook_url, payload)

    return {
        "tally": session["tally"],
        "voter_count": session["voter_count"],
        "voters": session["voters"],
        "attendees": session["attendees"],
    }


# SPA catch-all — must be registered AFTER all /api/* routes so FastAPI's
# router matches specific routes first. Serves index.html for any unknown
# path (client-side routing), or the actual static file if it exists.
if os.path.isdir(STATIC_DIR):

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        possible_file = os.path.join(STATIC_DIR, full_path)
        if os.path.isfile(possible_file):
            return FileResponse(possible_file)
        WEB_PAGE_VIEWS.inc()
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
