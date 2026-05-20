# Padel Agent

An AI-powered assistant for finding and booking Padel court slots on Playtomic. The project ships a React web app with three modes, a WhatsApp bot, and a Python CLI — all backed by a FastAPI service and a LangGraph AI agent.

## Features

- **Chat Mode** — Converse with an AI agent (Google Gemini or NVIDIA NIM) in natural language. Ask it to find slots, and it will search Playtomic for you.
- **Find Mode** — Direct slot search: pick clubs, date range, time windows, court type and duration. No AI involved, just fast results.
- **Group Voting** — Select candidate slots from a Find Mode search, share a link, and let everyone vote on which time works best.
- **WhatsApp Bot** — Same AI agent accessible over WhatsApp via neonize. Persists per-user history and preferences in SQLite.
- **User Profile Memory** — The agent learns your preferred club, city, court type, duration and preferred time. Stored in browser `localStorage` (web) or SQLite (WhatsApp).
- **Python CLI** — Search clubs and query available slots directly from the terminal.
- **Multi-region** — Language, timezone and country are auto-detected or configurable per request.
- **Dark / Light theme** — Toggled via the settings menu.

## Project Structure

```
src/playtomic_agent/
├── web/
│   ├── agent.py        # Web LangGraph agent
│   └── api.py          # FastAPI app: /api/chat (SSE), /api/search, /api/votes, /api/clubs
├── whatsapp/
│   ├── server.py       # neonize entry point
│   ├── agent.py        # WhatsApp LangGraph agent
│   └── storage.py      # UserStorage (SQLite)
├── tools.py            # LangChain @tool definitions
├── llm.py              # Shared LLM instance (Gemini / NVIDIA)
├── config.py           # Settings via pydantic-settings / .env
├── context.py          # ContextVar helpers: language, country, timezone
├── models.py           # Pydantic models: Club, Court, Slot
└── client/
    ├── api.py          # PlaytomicClient
    ├── cli.py          # playtomic-cli entry point
    ├── utils.py        # Geocoding, booking URL helpers
    └── exceptions.py
web/                    # React 18 + Vite frontend
tests/                  # pytest suite
docs/
├── DEPLOYMENT.md       # Railway deployment guide
└── product/            # Product strategy, roadmap, backlog
```

## Setup

### Prerequisites

- Python ≥ 3.11 and [uv](https://docs.astral.sh/uv/)
- Node.js ≥ 18 (for the web frontend)

### Install

```bash
uv sync
```

### Configure

```bash
cp .env.example .env   # then fill in the values
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | if `LLM_PROVIDER=gemini` (default) | — | Google Gemini API key |
| `NVIDIA_API_KEY` | if `LLM_PROVIDER=nvidia` | — | NVIDIA API key (`nvapi-…`) |
| `NVIDIA_BASE_URL` | no | — | Base URL for a self-hosted NVIDIA NIM |
| `LLM_PROVIDER` | no | `gemini` | `gemini` or `nvidia` |
| `DEFAULT_MODEL` | no | provider default | Override model ID |
| `DEFAULT_TIMEZONE` | no | `Europe/Berlin` | Fallback timezone |
| `PLAYTOMIC_API_BASE_URL` | no | `https://api.playtomic.io/v1` | Playtomic REST API base |
| `WHATSAPP_PHONE_NUMBER` | WhatsApp only | — | Phone for pairing-code login |
| `WHATSAPP_SESSION_DB` | WhatsApp only | `data/whatsapp_session.db` | neonize SQLite session file |
| `WHATSAPP_STORAGE_PATH` | WhatsApp only | `data/whatsapp_users.db` | Per-user state (SQLite) |

## Running

### Web app (backend + frontend)

```bash
# Backend (port 8082)
uvicorn playtomic_agent.web.api:app --reload --port 8082

# Frontend (port 8080)
cd web && npm install && npm run dev -- --port 8080
```

Open [http://localhost:8080](http://localhost:8080).

### WhatsApp agent

```bash
whatsapp-agent           # scan QR on first run
LOG_LEVEL=DEBUG whatsapp-agent
```

### CLI

```bash
playtomic-cli search --name "Lemon Padel"
playtomic-cli slots --club-slug lemon-padel-club --date 2026-05-20 --json
```

## Development

```bash
# Tests
pytest tests/ -v

# Lint & format
ruff check src/ tests/
ruff format src/ tests/

# Type checking
mypy src/
```

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Railway setup (web + WhatsApp as separate services).

## Architecture

```
Browser/WhatsApp
      │
      ▼
FastAPI (web/api.py)         ← SSE streaming for chat, REST for search/votes
      │
      ├── LangGraph Agent    ← tools.py, llm.py
      │       └── Tools: find_slots, find_clubs_by_location, find_clubs_by_name,
      │                   create_booking_link, update_user_profile, suggest_next_steps
      └── PlaytomicClient    ← direct API calls for /api/search, /api/clubs
```

## License

MIT
