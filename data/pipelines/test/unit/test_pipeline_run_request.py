import pytest

from pipelines.deploy.function.pipeline_run_request import (
    InvalidPipelineRunRequest,
    parse_pipeline_run_request,
    PipelineRunRequest,
)


@pytest.mark.parametrize("body", [b"", b"  ", b"{}"])
def test_empty_body_returns_scheduled_run_request(body: bytes) -> None:
    # Arrange
    expected = PipelineRunRequest()

    # Act
    run_request = parse_pipeline_run_request(body)

    # Assert
    assert run_request == expected


def test_full_body_is_parsed() -> None:
    # Arrange
    body = b'{"hazard_type": "floods", "mock": 1, "countries": ["KEN", "ETH"]}'

    # Act
    run_request = parse_pipeline_run_request(body)

    # Assert
    assert run_request == PipelineRunRequest(
        hazard_type="floods", mock=1, countries=("KEN", "ETH")
    )


@pytest.mark.parametrize(
    "body",
    [
        b"not json",
        b"[]",
        b'{"mok": 1}',
        b'{"hazard_type": "earthquake"}',
        b'{"mock": true}',
        b'{"mock": 2}',
        b'{"mock": 1.0}',
        b'{"mock": "1"}',
        b'{"countries": []}',
        b'{"countries": "KEN"}',
        b'{"countries": ["ken"]}',
        b'{"countries": ["KEN; rm -rf /"]}',
    ],
)
def test_invalid_body_is_rejected(body: bytes) -> None:
    # Arrange
    # (invalid request bodies are parametrized)

    # Act & Assert
    with pytest.raises(InvalidPipelineRunRequest):
        parse_pipeline_run_request(body)
