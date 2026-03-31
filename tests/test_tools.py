"""Tests for playtomic_agent.tools module."""

from playtomic_agent.tools import handoff_to_find


def test_handoff_to_find_returns_status():
    """Test handoff_to_find with all parameters filled."""
    result = handoff_to_find.invoke(
        {
            "club_slug": "lemon-padel-club",
            "club_name": "Lemon Padel",
            "date_from": "2026-04-05",
            "date_to": "2026-04-06",
            "time_from": "18:00",
            "time_to": "22:00",
            "duration": 90,
            "court_type": "DOUBLE",
        }
    )
    assert result == {"status": "handoff_ready"}


def test_handoff_to_find_all_optional():
    """Test handoff_to_find with no parameters (all optional)."""
    result = handoff_to_find.invoke({})
    assert result == {"status": "handoff_ready"}
