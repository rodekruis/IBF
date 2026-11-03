from __future__ import annotations

import ftplib
from unittest.mock import MagicMock, patch

import pytest

from pipelines.infra.utils.ftp_connection import download_ftp_file, FtpConnection

FTP_CONNECTION_MODULE = "pipelines.infra.utils.ftp_connection"
RETRY_MODULE = "pipelines.infra.utils.retry"


def test_download_ftp_file_retries_failed_reconnect() -> None:
    # Arrange
    dropped_ftp = MagicMock()
    dropped_ftp.retrbinary.side_effect = EOFError()
    reconnected_ftp = MagicMock()
    reconnected_ftp.retrbinary.side_effect = lambda _command, callback: callback(
        b"content"
    )

    connection = FtpConnection("host", "user", "pass", "remote_dir")
    connection.ftp = dropped_ftp

    # Act
    with (
        patch(
            f"{FTP_CONNECTION_MODULE}.connect_ftp",
            side_effect=[ConnectionResetError(), reconnected_ftp],
        ),
        patch(f"{RETRY_MODULE}.time.sleep"),
    ):
        content = download_ftp_file(connection, "dis_04.nc")

    # Assert
    assert content == b"content"
    assert connection.ftp is reconnected_ftp
    dropped_ftp.close.assert_called_once()


def test_download_ftp_file_closes_new_connection_on_permanent_rejection() -> None:
    # Arrange
    new_ftp = MagicMock()
    new_ftp.retrbinary.side_effect = ftplib.error_perm("550 No such file")

    # Act
    with (
        patch(f"{FTP_CONNECTION_MODULE}.connect_ftp", return_value=new_ftp),
        pytest.raises(FileNotFoundError, match="FTP server rejected"),
        FtpConnection("host", "user", "pass", "remote_dir") as connection,
    ):
        download_ftp_file(connection, "dis_04.nc")

    # Assert
    new_ftp.quit.assert_called_once()
