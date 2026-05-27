import pytest
from pipelines.flood.extract_forecast import _parse_lead_time_range


def test_parses_standard_spectrum():
    temporal_extent = {
        "lead-time-spectrum": [
            "0-day",
            "1-day",
            "2-day",
            "3-day",
            "4-day",
            "5-day",
            "6-day",
            "7-day",
        ]
    }
    assert _parse_lead_time_range(temporal_extent) == (0, 7)


def test_parses_subset_spectrum():
    temporal_extent = {"lead-time-spectrum": ["2-day", "3-day", "4-day"]}
    assert _parse_lead_time_range(temporal_extent) == (2, 4)


def test_parses_single_day_spectrum():
    temporal_extent = {"lead-time-spectrum": ["0-day"]}
    assert _parse_lead_time_range(temporal_extent) == (0, 0)


def test_raises_when_spectrum_missing():
    with pytest.raises(ValueError, match="missing 'lead-time-spectrum'"):
        _parse_lead_time_range({})


def test_raises_when_spectrum_empty():
    with pytest.raises(ValueError, match="missing 'lead-time-spectrum'"):
        _parse_lead_time_range({"lead-time-spectrum": []})
