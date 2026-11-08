"""Short-lived, transaction-safe SQLite connections."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.config import Settings


def ensure_runtime_directories(settings: Settings) -> None:
    for directory in (settings.database_path.parent, settings.uploads_dir, settings.outputs_dir, settings.logs_dir):
        directory.mkdir(parents=True, exist_ok=True)


@contextmanager
def connection(settings: Settings) -> Iterator[sqlite3.Connection]:
    con = sqlite3.connect(settings.database_path, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def initialize_database(settings: Settings) -> None:
    ensure_runtime_directories(settings)
    schema_path = Path(__file__).with_name("schema.sql")
    with connection(settings) as con:
        con.executescript(schema_path.read_text(encoding="utf-8"))
        con.execute(
            "UPDATE inspections SET status = 'failed', error_message = 'interrupted by restart', "
            "finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') "
            "WHERE status IN ('queued', 'processing')"
        )
