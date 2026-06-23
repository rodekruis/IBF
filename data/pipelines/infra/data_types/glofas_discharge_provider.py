from __future__ import annotations

import ftplib
import io
import logging
import os
import tempfile
import time
from datetime import datetime, timedelta, timezone
from fileinput import filename

from pipelines.infra.utils.nrw_logger import log_with_tag, LogTag
from pipelines.infra.utils.path_helpers import (
    get_cached_glofas_files,
    get_glofas_raw_data_dir,
)

logger = logging.getLogger(__name__)

GLOFAS_FTP_BASE_PATH = "DATA/CEMS_Flood_Glofas/fc_netcdf"

# Minimum allowed number of 'ensemble' forecast files in the GloFAS data.
# If fewer than this, fail the data load (which alerts the team of an error)
# and do not run the forecast pipeline.
GLOFAS_MIN_ENSEMBLE_COUNT = 34  # 2/3 of the total number of ensemble members

# Number of hours to reuse existing GloFAS data before downloading new data.
# The time of the data is set based on when the download starts.
# The download is expected to take between one and three hours.
# We expect to be running the data pipelines once a day.
# We mainly want to assure we fetch new data on the first run of the day, and not need
# to re-download it for subsequent forecast runs (for other countries).
GLOFAS_DATA_REUSE_PERIOD_HOURS = 12


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
    host = os.environ.get("GLOFAS_FTP_HOST")
    user = os.environ.get("GLOFAS_FTP_USER")
    password = os.environ.get("GLOFAS_FTP_PASSWORD")
    ensemble_count = int(os.environ.get("GLOFAS_FTP_ENSEMBLE_COUNT", "51"))

    if not host or not user or not password:
        raise ValueError(
            "GloFAS FTP credentials not configured. "
            "Set GLOFAS_FTP_HOST, GLOFAS_FTP_USER, and GLOFAS_FTP_PASSWORD."
        )

    forecast_date = datetime.now(timezone.utc).strftime("%Y%m%d%H")
    forecast_date = _resolve_forecast_date(forecast_date, user, password, host)

    cached_files = get_cached_glofas_files(
        forecast_date, GLOFAS_DATA_REUSE_PERIOD_HOURS
    )
    if cached_files is not None:
        logger.info(
            f"Reusing {len(cached_files)} cached GloFAS ensemble files for {forecast_date}"
        )
        _validate_ensemble_count(cached_files, forecast_date)
        return cached_files

    output_dir = get_glofas_raw_data_dir(forecast_date)
    downloaded_paths: list[str] = []
    remote_dir = f"{GLOFAS_FTP_BASE_PATH}/{forecast_date}"

    download_start = time.monotonic()

    ftp = _connect_ftp(host, user, password)
    ftp.cwd(remote_dir)

    try:
        for ensemble_index in range(ensemble_count):
            ensemble_label = f"{ensemble_index:02d}"
            filename = f"dis_{ensemble_label}_{forecast_date}00.nc"

            logger.info(
                f"Downloading GloFAS ensemble {ensemble_label}/{ensemble_count} for {country}"
            )

            content, ftp = _download_ftp_file(
                ftp, filename, host, user, password, remote_dir
            )

            local_path = os.path.join(output_dir, filename)
            with open(local_path, "wb") as f:
                f.write(content)

            downloaded_paths.append(local_path)
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            ftp.close()

    download_duration_seconds = time.monotonic() - download_start
    log_with_tag(
        logger,
        LogTag.DOWNLOAD_TIMER,
        f"Downloaded {len(downloaded_paths)} GloFAS ensemble files for {country} "
        f"in {download_duration_seconds:.1f}s",
    )

    logger.info(
        f"Downloaded {len(downloaded_paths)} GloFAS ensemble files to {output_dir}"
    )
    _validate_ensemble_count(downloaded_paths, forecast_date)
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
    url = f"{base_url}/pipelines/mock-data/floods/glofas-discharge/{filename}"

    logger.info(f"Downloading GloFAS mock discharge from {url}")

    from shared.download_helpers import download_object

    content = download_object(url)
    if content is None:
        raise FileNotFoundError(f"Failed to download GloFAS discharge from '{url}'")

    forecast_date = datetime.now(timezone.utc).strftime("%Y%m%d%H")
    local_filename = f"dis_00_{forecast_date}00.nc"
    output_dir = tempfile.mkdtemp(prefix=f"glofas_{country}_mock_")
    local_path = os.path.join(output_dir, local_filename)
    with open(local_path, "wb") as f:
        f.write(content)

    logger.info(f"Downloaded GloFAS mock discharge to {local_path}")
    return [local_path]


def _validate_ensemble_count(files: list[str], forecast_date: str) -> None:
    if len(files) < GLOFAS_MIN_ENSEMBLE_COUNT:
        raise ValueError(
            f"Insufficient GloFAS ensemble files for {forecast_date}: "
            f"found {len(files)}, minimum required is {GLOFAS_MIN_ENSEMBLE_COUNT}."
        )


def _connect_ftp(host: str, user: str, password: str, timeout: int = 60) -> ftplib.FTP:
    ftp = ftplib.FTP(host, timeout=timeout)
    ftp.login(user, password)
    return ftp


def _download_ftp_file(
    ftp: ftplib.FTP,
    filename: str,
    host: str,
    user: str,
    password: str,
    remote_dir: str,
) -> tuple[bytes, ftplib.FTP]:
    """Download a single file, reconnecting on transient errors.
    Returns the file content together with the (possibly re-established) FTP
    connection, so the caller continues with a live connection.
    """
    # attempt n waits RETRY_BACKOFF_SECONDS * n before reconnecting.
    retry_backoff_seconds = 5
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            buffer = io.BytesIO()
            ftp.retrbinary(f"RETR {filename}", buffer.write)
            return buffer.getvalue(), ftp
        except ftplib.error_perm as exc:
            raise FileNotFoundError(f"FTP server rejected '{filename}': {exc}") from exc
        except ftplib.all_errors as exc:
            logger.error(
                f"Attempt {attempt}/{max_retries} failed for '{filename}': {exc}"
            )
            if attempt == max_retries:
                raise ConnectionError(
                    f"Failed to download '{filename}' after {max_retries} attempts"
                ) from exc

            # The connection might be dead
            # Rebuild it before retrying
            try:
                ftp.close()
            except ftplib.all_errors:
                pass
            time.sleep(retry_backoff_seconds * attempt)
            ftp = _connect_ftp(host, user, password)
            ftp.cwd(remote_dir)

    raise ConnectionError(
        f"Failed to download '{filename}' after {max_retries} attempts"
    )


def _resolve_forecast_date(today: str, user: str, password: str, host: str) -> str:
    ftp = _connect_ftp(host, user, password, timeout=15)
    ftp.cwd(GLOFAS_FTP_BASE_PATH)
    available_dates = sorted(ftp.nlst())
    ftp.quit()

    if today in available_dates:
        return today

    # TODO: move this fallback behaviour to a separate download-job we might set up
    yesterday = (datetime.strptime(today, "%Y%m%d") - timedelta(days=1)).strftime(
        "%Y%m%d"
    )
    if yesterday in available_dates:
        logger.warning(
            f"GloFAS data for {today} not yet available, falling back to {yesterday}"
        )
        return yesterday

    raise FileNotFoundError(
        f"GloFAS data not available for {today} or {yesterday}. "
        f"Available dates: {available_dates[-5:]}"
    )
