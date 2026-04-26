from datetime import datetime

from langchain.agents import create_agent
from langgraph.graph.state import CompiledStateGraph

from playtomic_agent.config import get_settings
from playtomic_agent.llm import llm
from playtomic_agent.tools import (
    create_booking_link,
    find_clubs_by_location,
    find_clubs_by_name,
    find_slots,
    find_slots_date_range,
    handoff_to_find,
    is_weekend,
    suggest_next_steps,
    update_user_profile,
)

settings = get_settings()

TOOLS = [
    find_slots,
    find_slots_date_range,
    create_booking_link,
    is_weekend,
    find_clubs_by_location,
    find_clubs_by_name,
    update_user_profile,
    suggest_next_steps,
    handoff_to_find,
]


def _build_system_prompt(user_profile: dict | None = None, language: str | None = None) -> str:
    """Build the system prompt with optional user profile context and language."""
    profile_section = ""
    if user_profile:
        prefs = []
        if user_profile.get("preferred_club_name"):
            prefs.append(
                f"- Club: {user_profile['preferred_club_name']}"
                f" (slug: {user_profile.get('preferred_club_slug', 'unknown')})"
            )
        if user_profile.get("preferred_city"):
            prefs.append(f"- City: {user_profile['preferred_city']}")
        if user_profile.get("court_type"):
            prefs.append(f"- Court type: {user_profile['court_type']}")
        if user_profile.get("duration"):
            prefs.append(f"- Duration: {user_profile['duration']} min")
        if user_profile.get("preferred_time"):
            prefs.append(f"- Time: {user_profile['preferred_time']}")

        if prefs:
            profile_section = (
                "\n\nUSER PREFERENCES (from previous sessions — confirm each before using):\n"
                + "\n".join(prefs)
            )

    lang_map = {
        "de": "German",
        "en": "English",
        "es": "Spanish",
        "fr": "French",
        "it": "Italian",
        "pt": "Portuguese",
        "nl": "Dutch",
    }

    # Use provided language or fall back to context/settings
    if not language:
        try:
            from playtomic_agent.context import get_language

            language = get_language()
        except ImportError:
            language = "en"

    lang_name = lang_map.get(language, language)

    return f"""You are a Padel court finder. Today: {datetime.now().strftime("%Y-%m-%d")}. \
Timezone: {settings.default_timezone}. Language: {lang_name}. \
Only answer about Padel bookings. Never invent names, times, prices, or links.

FIND A CLUB:
- Name mentioned → `find_clubs_by_name` (short name only)
- City/region → `find_clubs_by_location`
- Once club is known → `update_user_profile` twice: `preferred_club_slug` + `preferred_club_name`

FIND SLOTS — collect in order, one question per reply:
1. Club — ask/confirm even if in profile
2. Date or date range — ask/confirm even if implied
3. Time window — ask/confirm even if in profile
4. Duration + court type — optional; skip if user doesn't care
→ browse/explore intent: `handoff_to_find` with all collected params. \
Resolve relative dates ("this weekend") to YYYY-MM-DD. \
Split preferred_time (e.g. "18:00-21:00") into time_from/time_to. \
Do NOT send any follow-up message after this call.
→ direct answer ("just tell me what's free"): \
`find_slots` (single date) or `find_slots_date_range` (max 7 days)

RESULTS (>0 slots): show top 5. Format: **HH:MM** - DURATION min - **PRICE** - [Book](booking_link)
Multiple options? → `suggest_next_steps`

PREFERENCES: detect any new preference → `update_user_profile` silently.{profile_section}"""


def create_playtomic_agent(
    user_profile: dict | None = None, language: str | None = None
) -> CompiledStateGraph:
    """Create the playtomic agent with an optional user profile injected into the system prompt."""
    return create_agent(
        model=llm,
        name="playtomic_agent",
        tools=TOOLS,
        system_prompt=_build_system_prompt(user_profile, language=language),
    )


# Default agent instance (no profile) for backward compatibility
playtomic_agent: CompiledStateGraph = create_playtomic_agent()

if __name__ == "__main__":
    for chunk in playtomic_agent.stream(
        {
            "messages": [
                {
                    "role": "user",
                    "content": """
                                            Search for the next available 90 minutes slot for a double court at lemon-padel-club on
                                            after 12:00. Search until you found one.
                                            """,
                }
            ]
        },
        stream_mode="updates",
    ):
        for step, data in chunk.items():
            print(f"\nstep: {step}\n")
            print(data)
