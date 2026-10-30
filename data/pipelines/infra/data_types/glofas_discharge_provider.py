from __future__ import annotations

import ftplib
import io
import logging
import os
import time
from datetime import datetime, UTC
from typing import Self

from pipelines.flood.constants import GLOFAS_MIN_ENSEMBLE_COUNT
from pipelines.infra.environment import load_environment_settings
from pipelines.infra.utils.nrw_logger import log_info, log_warning, log_with_tag, LogTag
from pipelines.infra.utils.retry import retry
from pipelines.infra.utils.storage_helpers import (
    find_latest_forecast_date_in_cache,
    get_cached_glofas_country_split_files,
    get_cached_glofas_files,
    get_glofas_mock_data_dir,
    get_glofas_raw_data_dir,
    GLOFAS_COUNTRY_SPLIT_DATA_DIR,
    GLOFAS_RAW_DATA_DIR,
)

logger = logging.getLogger(__name__)

GLOFAS_FTP_BASE_PATH = "DATA/CEMS_Flood_Glofas/fc_netcdf"

# Transient protocol errors and dead connections. Permanent rejections
# (error_perm) will never succeed on retry.
FTP_RETRYABLE_ERRORS = (
    ftplib.error_temp,
    ftplib.error_reply,
    ftplib.error_proto,
    EOFError,
    OSError,
)


def download_glofas_discharge_from_ftp(country: str) -> list[str]:
    """
    Download GloFAS discharge NetCDF files from FTP for today's forecast.

    Downloads one file per ensemble member. Each file contains global discharge
    data with bands per lead time. The pipeline slices these to country bounds
    before processing.

    Required env vars:
        GLOFAS_FTP_HOST: FTP host (e.g. "aux.ecmwf.int")
        GLOFAS_FTP_USER: FTP username
        GLOFAS_FTP_PASSWORD: FTP password
        GLOFAS_FTP_ENSEMBLE_COUNT: Number of ensemble members (default: 51)

    Returns a list of local file paths to the downloaded NetCDF files.
    """
    host, user, password = _load_ftp_credentials()
    ensemble_count = int(os.environ.get("GLOFAS_FTP_ENSEMBLE_COUNT", "51"))

    forecast_date = datetime.now(UTC).strftime("%Y%m%d")
    forecast_date = _resolve_forecast_date(forecast_date, user, password, host)

    existing_download = _try_reuse_existing_download(forecast_date)
    if existing_download is not None:
        return existing_download

    # Resume from a partial download only in development (avoids re-downloading all
    # files when a connection failure interrupts a local run).
    # On prod and test, always start fresh.
    env = load_environment_settings()
    resume_index = 0
    if env.is_development:
        resume_index = _get_download_resume_index(forecast_date)

    downloaded_paths = _download_ensemble_files(
        host, user, password, forecast_date, ensemble_count, resume_index, country
    )

    _validate_ensemble_count(downloaded_paths, forecast_date)
    return downloaded_paths


def _load_ftp_credentials() -> tuple[str, str, str]:
    host = os.environ.get("GLOFAS_FTP_HOST")
    user = os.environ.get("GLOFAS_FTP_USER")
    password = os.environ.get("GLOFAS_FTP_PASSWORD")

    if not host or not user or not password:
        raise ValueError(
            "GloFAS FTP credentials not configured. "
            "Set GLOFAS_FTP_HOST, GLOFAS_FTP_USER, and GLOFAS_FTP_PASSWORD."
        )
    return host, user, password


def _try_reuse_existing_download(forecast_date: str) -> list[str] | None:
    """Return previously downloaded files if a complete set exists, otherwise None."""
    existing_files = get_cached_glofas_files(forecast_date)
    if existing_files is not None and len(existing_files) >= GLOFAS_MIN_ENSEMBLE_COUNT:
        log_info(
            logger,
            LogTag.INFRA,
            f"Reusing {len(existing_files)} previously downloaded GloFAS ensemble files for {forecast_date}",
        )
        return existing_files
    return None


def _get_download_resume_index(forecast_date: str) -> int:
    """Determine the ensemble index to resume downloading from.

    If a partial download exists (below minimum count), resumes from the highest
    index + 1. Returns 0 if no prior download exists.

    The resume downloading flow isn't expected to be used on cloud deployments, but
    it's useful when running this locally.
    """
    existing_files = get_cached_glofas_files(forecast_date)
    if existing_files is None:
        return 0

    highest_index = _get_highest_ensemble_index(existing_files)
    log_info(
        logger,
        LogTag.INFRA,
        f"Found {len(existing_files)} previously downloaded GloFAS ensemble files for {forecast_date}, "
        f"below minimum of {GLOFAS_MIN_ENSEMBLE_COUNT}. "
        f"Resuming download from ensemble index {highest_index + 1}.",
    )
    return highest_index + 1


def _download_ensemble_files(
    host: str,
    user: str,
    password: str,
    forecast_date: str,
    ensemble_count: int,
    start_index: int,
    country: str,
) -> list[str]:
    """Download ensemble files from FTP, starting from start_index."""
    output_dir = get_glofas_raw_data_dir(forecast_date)
    remote_dir = f"{GLOFAS_FTP_BASE_PATH}/{forecast_date}"

    # Only include already-cached files when resuming a partial download
    cached_files = get_cached_glofas_files(forecast_date) if start_index > 0 else None
    downloaded_paths: list[str] = list(cached_files) if cached_files is not None else []

    download_start = time.monotonic()

    with FtpConnection(host, user, password, remote_dir) as connection:
        # Grab new ensemble files, starting from the highest index found in cached files
        for ensemble_index in range(start_index, ensemble_count):
            ensemble_label = f"{ensemble_index:02d}"
            filename = f"dis_{ensemble_label}_{forecast_date}00.nc"

            log_info(
                logger,
                LogTag.INFRA,
                f"Downloading GloFAS ensemble {ensemble_label}/{ensemble_count} for {country}",
            )

            content = _download_ftp_file(connection, filename)

            local_path = os.path.join(output_dir, filename)
            with open(local_path, "wb") as f:
                f.write(content)

            downloaded_paths.append(local_path)

    download_duration_seconds = time.monotonic() - download_start
    log_with_tag(
        logger,
        LogTag.DOWNLOAD_TIMER,
        f"Downloaded {len(downloaded_paths)} GloFAS ensemble files for {country} "
        f"in {download_duration_seconds:.1f}s",
    )

    log_info(
        logger,
        LogTag.INFRA,
        f"Downloaded {len(downloaded_paths)} GloFAS ensemble files to {output_dir}",
    )
    return downloaded_paths


def download_glofas_discharge_from_seed_repo(
    country: str, mock_variant: str
) -> list[str]:
    """
    Download a mock GloFAS discharge NetCDF file from the seed-data repo.

    The file is a small country-clipped NetCDF with synthetic discharge values
    that deterministically produce either an alert or no-alert outcome.

    Returns a list with a single local file path to the downloaded NetCDF file.
    """
    base_url = os.environ.get("GITHUB_DATA_BASE_URL")
    if not base_url:
        raise ValueError(
            "GITHUB_DATA_BASE_URL environment variable is required "
            "for loading GloFAS discharge from seed-repo."
        )

    filename = f"{country}_glofas_discharge_{mock_variant}.nc"
    url = f"{base_url}/mock-forecasts/flood/glofas-discharge/{filename}"

    log_info(logger, LogTag.INFRA, f"Downloading GloFAS mock discharge from {url}")

    from shared.download_helpers import download_object

    content = download_object(url)
    if content is None:
        raise FileNotFoundError(f"Failed to download GloFAS discharge from '{url}'")

    forecast_date = datetime.now(UTC).strftime("%Y%m%d")
    local_filename = f"dis_00_{forecast_date}00.nc"
    output_dir = get_glofas_mock_data_dir(country)
    local_path = os.path.join(output_dir, local_filename)
    with open(local_path, "wb") as f:
        f.write(content)

    log_info(logger, LogTag.INFRA, f"Downloaded GloFAS mock discharge to {local_path}")
    return [local_path]


def load_glofas_discharge_from_local_global_files(
    country: str, local_data_date: str | None
) -> list[str]:
    """
    Load previously downloaded raw global GloFAS discharge files from local cache.

    Global data is retained for about a week after a production run.
    Useful for debugging issues in the download → slicing flow.

    Unlike the FTP download path, this does NOT enforce the minimum ensemble
    count. Developers can run with even a single cached file for fast iteration.

    If local_data_date is None, uses the most recent cached date.
    Raises FileNotFoundError if no cached data is found.
    """
    if local_data_date is None:
        local_data_date = find_latest_forecast_date_in_cache(GLOFAS_RAW_DATA_DIR)
        if local_data_date is None:
            raise FileNotFoundError(
                "No locally cached raw GloFAS data found. "
                "Run a live pipeline first or specify --local-data-date."
            )
        log_info(
            logger, LogTag.INFRA, f"Using most recent local raw data: {local_data_date}"
        )

    cached_files = get_cached_glofas_files(local_data_date)
    if cached_files is None or len(cached_files) == 0:
        raise FileNotFoundError(
            f"No locally cached raw GloFAS files found for date {local_data_date}. "
            f"Available data can be found in DATA_CACHE_DIR/glofas/raw/."
        )

    log_info(
        logger,
        LogTag.INFRA,
        f"Loaded {len(cached_files)} local raw GloFAS files for {local_data_date} "
        f"(country: {country})",
    )
    return cached_files


def load_glofas_discharge_from_local_country_files(
    country: str, local_data_date: str | None
) -> list[str]:
    """
    Load previously country-split GloFAS discharge files from local cache.

    This is the primary debug path for checking results from real pipeline runs.
    Production retains country-split data longer than global raw files.

    Unlike the FTP download path, this does NOT enforce the minimum ensemble
    count. Developers can run with even a single cached file for fast iteration.

    If local_data_date is None, uses the most recent cached date.
    Raises FileNotFoundError if no cached data is found.
    """
    if local_data_date is None:
        local_data_date = find_latest_forecast_date_in_cache(
            GLOFAS_COUNTRY_SPLIT_DATA_DIR
        )
        if local_data_date is None:
            raise FileNotFoundError(
                "No locally cached country-split GloFAS data found. "
                "Run a live pipeline first or specify --local-data-date."
            )
        log_info(
            logger,
            LogTag.INFRA,
            f"Using most recent local country-split data: {local_data_date}",
        )

    cached_files = get_cached_glofas_country_split_files(country, local_data_date)
    if cached_files is None or len(cached_files) == 0:
        raise FileNotFoundError(
            f"No locally cached country-split GloFAS files found for {country} "
            f"on date {local_data_date}. "
            f"Available data can be found in "
            f"DATA_CACHE_DIR/glofas/country_split/."
        )

    log_info(
        logger,
        LogTag.INFRA,
        f"Loaded {len(cached_files)} local country-split GloFAS files "
        f"for {country} on {local_data_date}",
    )
    return cached_files


def _validate_ensemble_count(files: list[str], forecast_date: str) -> None:
    if len(files) < GLOFAS_MIN_ENSEMBLE_COUNT:
        raise ValueError(
            f"Insufficient GloFAS ensemble files for {forecast_date}: "
            f"found {len(files)}, minimum required is {GLOFAS_MIN_ENSEMBLE_COUNT}."
        )


def _get_highest_ensemble_index(files: list[str]) -> int:
    """Return the highest ensemble index found in GloFAS NetCDF filenames.

    Filenames follow the pattern ``dis_{ensemble_index:02d}_{forecast_date}00.nc``.
    Returns -1 when no parsable ensemble index is found.
    """
    highest_index = -1
    for file_path in files:
        basename = os.path.basename(file_path)
        parts = basename.split("_")
        if len(parts) < 2 or not parts[1].isdigit():
            continue
        highest_index = max(highest_index, int(parts[1]))
    return highest_index


def _connect_ftp(host: str, user: str, password: str, timeout: int = 60) -> ftplib.FTP:
    ftp = ftplib.FTP(host, timeout=timeout)
    try:
        ftp.login(user, password)
    except ftplib.all_errors:
        ftp.close()
        raise
    return ftp


def _close_ftp(ftp: ftplib.FTP | None) -> None:
    # quit() on an already closed connection raises AttributeError
    if ftp is None or ftp.sock is None:
        return
    try:
        ftp.quit()
    except ftplib.all_errors:
        ftp.close()


class FtpConnection:
    """FTP connection that connects lazily and drops itself after transport errors,
    so the next call reconnects. Closes the connection when used as a context manager.
    """

    def __init__(self, host: str, user: str, password: str, remote_dir: str) -> None:
        self.host = host
        self.user = user
        self.password = password
        self.remote_dir = remote_dir
        self.ftp: ftplib.FTP | None = None

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_: object) -> None:
        _close_ftp(self.ftp)
        self.ftp = None

    def retrieve(self, filename: str) -> bytes:
        try:
            ftp = self._get()
            buffer = io.BytesIO()
            ftp.retrbinary(f"RETR {filename}", buffer.write)
            return buffer.getvalue()
        except FTP_RETRYABLE_ERRORS:
            self._reset()
            raise

    def _get(self) -> ftplib.FTP:
        if self.ftp is None:
            self.ftp = _connect_ftp(self.host, self.user, self.password)
            self.ftp.cwd(self.remote_dir)
        return self.ftp

    def _reset(self) -> None:
        # The connection might be dead, so close() rather than quit()
        if self.ftp is not None:
            self.ftp.close()
            self.ftp = None


def _download_ftp_file(connection: FtpConnection, filename: str) -> bytes:
    # Convert outside the retried function: FileNotFoundError is an OSError
    # and would otherwise be retried.
    try:
        return _retrieve_with_retry(connection, filename)
    except ftplib.error_perm as exc:
        raise FileNotFoundError(f"FTP server rejected '{filename}': {exc}") from exc


@retry(
    max_attempts=3,
    backoff_seconds=5,
    exceptions=FTP_RETRYABLE_ERRORS,
    description=lambda connection, filename: f"download '{filename}'",
)
def _retrieve_with_retry(connection: FtpConnection, filename: str) -> bytes:
    return connection.retrieve(filename)


def _resolve_forecast_date(today: str, user: str, password: str, host: str) -> str:
    """Resolve the forecast date to download from FTP.

    In production, retries with exponential backoff if today's data is not yet
    available (handles the case where the pipeline runs before data is published).
    In development/test, fails immediately.
    """
    env = load_environment_settings()

    if env.is_production:
        return _resolve_forecast_date_with_retry(today, user, password, host)

    return _check_forecast_date_available(today, user, password, host)


def _check_forecast_date_available(
    today: str, user: str, password: str, host: str
) -> str:
    """Check if today's data is available on FTP. Fails immediately if not."""
    with _connect_ftp(host, user, password, timeout=15) as ftp:
        ftp.cwd(GLOFAS_FTP_BASE_PATH)
        available_dates = sorted(ftp.nlst())

    if today in available_dates:
        return today

    raise FileNotFoundError(
        f"GloFAS data not available for {today}. "
        f"Use --local-data to run with locally cached data. "
        f"Available dates on FTP: {available_dates[-5:]}"
    )


def _resolve_forecast_date_with_retry(
    today: str, user: str, password: str, host: str
) -> str:
    """Retry with exponential backoff until today's data appears on FTP."""
    max_retries = 13
    base_delay_seconds = 60.0
    max_delay_seconds = 900.0  # cap at 15 minutes between retries (~2h30m total)

    available_dates: list[str] = []
    for attempt in range(max_retries + 1):
        with _connect_ftp(host, user, password, timeout=15) as ftp:
            ftp.cwd(GLOFAS_FTP_BASE_PATH)
            available_dates = sorted(ftp.nlst())

        if today in available_dates:
            return today

        if attempt >= max_retries:
            break

        delay = min(base_delay_seconds * (2**attempt), max_delay_seconds)
        log_warning(
            logger,
            LogTag.INFRA,
            f"GloFAS data for {today} not yet available "
            f"(attempt {attempt + 1}/{max_retries + 1}). "
            f"Retrying in {delay:.0f}s...",
        )
        time.sleep(delay)

    raise FileNotFoundError(
        f"GloFAS data not available for {today} after {max_retries + 1} attempts. "
        f"Available dates on FTP: {available_dates[-5:]}"
    )
