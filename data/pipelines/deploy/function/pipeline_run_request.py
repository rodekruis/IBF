"""Parse and validate the JSON body of a manual pipeline run request.

Kept free of Azure dependencies, so it can be unit tested without the Function
runtime. Unknown fields are rejected, so a misspelled option such as "mok"
cannot silently start a live-data run.
"""

import json
import re
from dataclasses import dataclass

# Must match the configs baked into the pipeline image (pipelines/infra/configs/).
AVAILABLE_HAZARD_TYPES = ("floods", "drought", "tropicalCyclone")
# Without --infra-only, the pipeline accepts only 0 (no alert) or 1 (alert).
MOCK_ALERT_COUNTS = (0, 1)
COUNTRY_CODE_PATTERN = re.compile(r"^[A-Z]{3}$")
REQUEST_FIELDS = frozenset({"hazard_type", "mock", "countries"})


class InvalidPipelineRunRequest(ValueError):
    pass


@dataclass(frozen=True)
class PipelineRunRequest:
    """Empty request: run the scheduled hazards with live data for all countries."""

    hazard_type: str | None = None
    mock: int | None = None
    countries: tuple[str, ...] = ()


def parse_pipeline_run_request(body: bytes) -> PipelineRunRequest:
    fields = parse_json_object(body)
    unknown_fields = sorted(set(fields) - REQUEST_FIELDS)
    if unknown_fields:
        raise InvalidPipelineRunRequest(
            f"Unknown field(s): {', '.join(unknown_fields)}. "
            f"Allowed: {', '.join(sorted(REQUEST_FIELDS))}."
        )
    return PipelineRunRequest(
        hazard_type=parse_hazard_type(fields.get("hazard_type")),
        mock=parse_mock(fields.get("mock")),
        countries=parse_countries(fields.get("countries")),
    )


def parse_json_object(body: bytes) -> dict[str, object]:
    if not body.strip():
        return {}
    try:
        parsed: object = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise InvalidPipelineRunRequest("Request body is not valid JSON.") from error
    if not isinstance(parsed, dict):
        raise InvalidPipelineRunRequest("Request body must be a JSON object.")
    return {str(key): value for key, value in parsed.items()}


def parse_hazard_type(value: object) -> str | None:
    if value is None:
        return None
    if value not in AVAILABLE_HAZARD_TYPES:
        raise InvalidPipelineRunRequest(
            f"Invalid hazard_type {value!r}. "
            f"Allowed: {', '.join(AVAILABLE_HAZARD_TYPES)}."
        )
    return str(value)


def parse_mock(value: object) -> int | None:
    if value is None:
        return None
    # bool is a subclass of int, so reject it explicitly.
    if (
        not isinstance(value, int)
        or isinstance(value, bool)
        or value not in MOCK_ALERT_COUNTS
    ):
        raise InvalidPipelineRunRequest(
            f"Invalid mock {value!r}. "
            f"Allowed: {', '.join(str(count) for count in MOCK_ALERT_COUNTS)}."
        )
    return value


def parse_countries(value: object) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list) or not value:
        raise InvalidPipelineRunRequest(
            "countries must be a non-empty list of ISO 3 codes, e.g. ['KEN']."
        )
    countries: list[str] = []
    for country in value:
        if not isinstance(country, str) or not COUNTRY_CODE_PATTERN.fullmatch(country):
            raise InvalidPipelineRunRequest(
                f"Invalid country {country!r}. Use uppercase ISO 3 codes, e.g. 'KEN'."
            )
        countries.append(country)
    return tuple(countries)
