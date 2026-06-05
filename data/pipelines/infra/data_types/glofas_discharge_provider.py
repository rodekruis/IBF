from __future__ import annotations

import ftplib
import io
import logging
import os
import tempfile
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

GLOFAS_FTP_BASE_PATH = "DATA/CEMS_Flood_Glofas/fc_netcdf"


def download_glofas_discharge_from_ftp(country: str) -> list[str]:
    """
    Download GloFAS discharge NetCDF files from FTP for today's forecast.

    Downloads one file per ensemble member. Each file contains global discharge
    data with bands per lead time. The pipeline slices these to country bounds
    before processing.

    TODO AB#42516: These files are global (~600MB each). Download once and share
    across country runs instead of re-downloading per country.

    TODO AB#42516: allow to proceed if a few ensemble run files are missing, as long as we have a minimum number to work with.

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

    forecast_date = datetime.now(timezone.utc).strftime("%Y%m%d")
    forecast_date = _resolve_forecast_date(forecast_date, user, password, host)

    output_dir = tempfile.mkdtemp(prefix=f"glofas_{country}_{forecast_date}_")
    downloaded_paths: list[str] = []

    ftp = _connect_ftp(host, user, password)
    ftp.cwd(f"{GLOFAS_FTP_BASE_PATH}/{forecast_date}")

    try:
        for ensemble_index in range(ensemble_count):
            ensemble_label = f"{ensemble_index:02d}"
            filename = f"dis_{ensemble_label}_{forecast_date}00.nc"

            logger.info(
                f"Downloading GloFAS ensemble {ensemble_label}/{ensemble_count} for {country}"
            )

            content = _download_ftp_file(ftp, filename)

            local_path = os.path.join(output_dir, filename)
            with open(local_path, "wb") as f:
                f.write(content)

            downloaded_paths.append(local_path)
    finally:
        ftp.quit()

    logger.info(
        f"Downloaded {len(downloaded_paths)} GloFAS ensemble files to {output_dir}"
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
    url = f"{base_url}/pipelines/mock-data/floods/glofas-discharge/{filename}"

    logger.info(f"Downloading GloFAS mock discharge from {url}")

    from shared.download_helpers import download_object

    content = download_object(url)
    if content is None:
        raise FileNotFoundError(f"Failed to download GloFAS discharge from '{url}'")

    forecast_date = datetime.now(timezone.utc).strftime("%Y%m%d")
    local_filename = f"dis_00_{forecast_date}00.nc"
    output_dir = tempfile.mkdtemp(prefix=f"glofas_{country}_mock_")
    local_path = os.path.join(output_dir, local_filename)
    with open(local_path, "wb") as f:
        f.write(content)

    logger.info(f"Downloaded GloFAS mock discharge to {local_path}")
    return [local_path]


def _connect_ftp(host: str, user: str, password: str, timeout: int = 60) -> ftplib.FTP:
    ftp = ftplib.FTP(host, timeout=timeout)
    ftp.login(user, password)
    return ftp


def _download_ftp_file(ftp: ftplib.FTP, filename: str) -> bytes:
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            buffer = io.BytesIO()
            ftp.retrbinary(f"RETR {filename}", buffer.write)
            return buffer.getvalue()
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
