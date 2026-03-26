"""Prometheus metrics for Padel Agent."""

import time
from typing import Any

from langchain_core.callbacks import BaseCallbackHandler
from prometheus_client import Counter, Gauge, Histogram
from prometheus_client import make_asgi_app as _make_asgi_app

# ── WhatsApp connection ──────────────────────────────────────────────────────
WA_CONNECTED = Gauge(
    "whatsapp_connected",
    "1 when connected to WhatsApp, 0 when disconnected",
)
WA_FAILURES = Counter(
    "whatsapp_connection_failures",
    "WhatsApp connection failure events",
    ["failure_type"],  # ban | logged_out | transient
)
WA_MESSAGES = Counter(
    "whatsapp_messages_processed",
    "WhatsApp messages passed to the agent",
)
WEB_MESSAGES = Counter(
    "web_messages_processed",
    "Web chat messages passed to the agent",
)
WEB_PAGE_VIEWS = Counter(
    "web_page_views",
    "Web page opens (index.html served)",
)

# ── Playtomic API health ─────────────────────────────────────────────────────
PLAYTOMIC_REQUESTS = Counter(
    "playtomic_api_requests",
    "Playtomic API HTTP requests",
    ["endpoint", "status"],  # status: success | error
)
PLAYTOMIC_LATENCY = Histogram(
    "playtomic_api_latency_seconds",
    "Playtomic API request latency in seconds",
    ["endpoint"],
    buckets=[0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0],
)
PLAYTOMIC_SCHEMA_ERRORS = Counter(
    "playtomic_api_schema_errors",
    "Playtomic API responses that failed Pydantic schema validation",
)

# ── Slot search outcomes ─────────────────────────────────────────────────────
SLOT_SEARCH_OUTCOMES = Counter(
    "slot_search_outcomes",
    "Slot search results by outcome",
    ["outcome"],  # found | not_found
)

# ── LLM usage ───────────────────────────────────────────────────────────────
LLM_INPUT_TOKENS = Counter(
    "llm_input_tokens",
    "LLM input tokens consumed",
    ["channel"],  # web | whatsapp
)
LLM_OUTPUT_TOKENS = Counter(
    "llm_output_tokens",
    "LLM output tokens generated",
    ["channel"],
)
LLM_INVOCATIONS = Counter(
    "llm_invocations",
    "LLM agent invocations",
    ["channel"],
)
LLM_LATENCY = Histogram(
    "llm_latency_seconds",
    "LLM call duration from request to full response received",
    ["channel"],
    buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 30.0, 60.0],
)
PLAYTOMIC_TOOL_CALLS = Counter(
    "playtomic_tool_calls",
    "Playtomic tool calls made by the agent",
    ["tool", "channel"],
)

# ── Votes ────────────────────────────────────────────────────────────────────
VOTES_CREATED = Counter(
    "votes_created",
    "Vote sessions created (web) or polls/vote-links dispatched (whatsapp)",
    ["channel"],  # web | whatsapp
)

# ── WhatsApp agent performance ────────────────────────────────────────────────
WA_RESPONSE_TIME = Histogram(
    "wa_response_time_seconds",
    "Time from receiving a WhatsApp message to sending the reply",
    buckets=[1.0, 5.0, 10.0, 20.0, 30.0, 60.0, 120.0],
)
WA_AGENT_ERRORS = Counter(
    "wa_agent_errors",
    "WhatsApp agent invocation errors",
    ["error_type"],  # timeout | exception
)

_PLAYTOMIC_TOOLS = frozenset(
    {
        "find_slots",
        "find_slots_date_range",
        "find_clubs_by_name",
        "find_clubs_by_location",
    }
)


class UsageCallbackHandler(BaseCallbackHandler):
    """LangChain callback that records Gemini token usage and tool calls to Prometheus."""

    def __init__(self, channel: str) -> None:
        super().__init__()
        self._channel = channel
        self._llm_start: dict[object, float] = {}

    def on_llm_start(
        self, serialized: dict[str, Any], prompts: list[str], **kwargs: object
    ) -> None:
        run_id = kwargs.get("run_id")
        if run_id is not None:
            self._llm_start[run_id] = time.perf_counter()

    def on_llm_end(self, response: Any, **kwargs: object) -> None:
        run_id = kwargs.get("run_id")
        start = self._llm_start.pop(run_id, None) if run_id is not None else None
        if start is not None:
            LLM_LATENCY.labels(channel=self._channel).observe(time.perf_counter() - start)
        LLM_INVOCATIONS.labels(channel=self._channel).inc()
        try:
            usage = response.generations[0][0].message.usage_metadata
            if usage:
                LLM_INPUT_TOKENS.labels(channel=self._channel).inc(usage.get("input_tokens", 0))
                LLM_OUTPUT_TOKENS.labels(channel=self._channel).inc(usage.get("output_tokens", 0))
        except (IndexError, AttributeError, TypeError):
            pass  # Graceful degradation: metrics unavailable, don't crash

    def on_tool_end(self, output: object, *, name: str = "", **kwargs: object) -> None:
        if name in _PLAYTOMIC_TOOLS:
            PLAYTOMIC_TOOL_CALLS.labels(tool=name, channel=self._channel).inc()


metrics_app = _make_asgi_app()
