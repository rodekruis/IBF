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


# TODO AB#41516: replace with seed-repo source using country-clipped mock alert/no-alert files
def load_glofas_discharge_from_mock_file() -> list[str]:
    """
    Load mock GloFAS discharge NetCDF files from the local filesystem.

    Looks for files in the directory specified by GLOFAS_LOCAL_DIR env var,
    or falls back to the default bronze directory.

    Returns a list of local file paths to the NetCDF files.
    """
    local_dir = os.environ.get("GLOFAS_LOCAL_DIR")
    if not local_dir:
        local_dir = "./pipelines/flood/bronze/glofas"

    if not os.path.isdir(local_dir):
        raise FileNotFoundError(
            f"GloFAS local directory not found: {local_dir}. "
            f"Set GLOFAS_LOCAL_DIR or place files in the default directory."
        )

    netcdf_files = sorted(
        os.path.join(local_dir, f)
        for f in os.listdir(local_dir)
        if f.endswith(".nc") and not f.endswith("_sliced.nc")
    )

    if not netcdf_files:
        raise FileNotFoundError(f"No GloFAS NetCDF files found in {local_dir}")

    logger.info(f"Loaded {len(netcdf_files)} GloFAS files from {local_dir}")
    return netcdf_files


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
