from __future__ import annotations

import ftplib
import io
from typing import Self

from pipelines.infra.utils.retry import retry

FTP_RETRYABLE_ERRORS = (
    ftplib.error_temp,
    ftplib.error_reply,
    ftplib.error_proto,
    EOFError,
    OSError,
)


def download_ftp_file(connection: FtpConnection, filename: str) -> bytes:
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


class FtpConnection:
    """FTP connection, used as a context manager that closes it on exit. Connects
    lazily and drops itself after transport errors, so the next call reconnects.
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
        # quit() on an already closed connection raises AttributeError
        if self.ftp is not None and self.ftp.sock is not None:
            try:
                self.ftp.quit()
            except ftplib.all_errors:
                self.ftp.close()
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
            self.ftp = connect_ftp(self.host, self.user, self.password)
            self.ftp.cwd(self.remote_dir)
        return self.ftp

    def _reset(self) -> None:
        # The connection might be dead, so close() rather than quit()
        if self.ftp is not None:
            self.ftp.close()
            self.ftp = None


def connect_ftp(host: str, user: str, password: str, timeout: int = 60) -> ftplib.FTP:
    ftp = ftplib.FTP(host, timeout=timeout)
    try:
        ftp.login(user, password)
    except ftplib.all_errors:
        ftp.close()
        raise
    return ftp
