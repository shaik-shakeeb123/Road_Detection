"""Persistence operations for inspection metadata."""

from __future__ import annotations

import json
from typing import Any, Mapping

from app.config import CLASS_CODES, Settings
from app.database.db import connection


def empty_class_counts() -> dict[str, int]:
    return {code: 0 for code in CLASS_CODES}


def normalize_class_counts(value: object) -> dict[str, int]:
    """Return a complete, safe class summary from stored JSON or legacy data."""
    counts = empty_class_counts()
    try:
        stored_counts = json.loads(value) if isinstance(value, str) else value
    except json.JSONDecodeError:
        stored_counts = {}
    if not isinstance(stored_counts, dict):
        return counts
    for code in CLASS_CODES:
        try:
            counts[code] = max(0, int(stored_counts.get(code, 0)))
        except (TypeError, ValueError, OverflowError):
            counts[code] = 0
    return counts


def create_image_inspection(settings: Settings, *, filename: str, confidence: float) -> int:
    """Create the durable record before inference begins."""
    with connection(settings) as con:
        cursor = con.execute(
            "INSERT INTO inspections (input_type, filename, conf_threshold, nms_mode, status, class_summary) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("image", filename, confidence, "end2end", "processing", json.dumps(empty_class_counts())),
        )
        return int(cursor.lastrowid)


def complete_image_inspection(
    settings: Settings,
    inspection_id: int,
    *,
    model: str,
    total_detections: int,
    class_counts: Mapping[str, int],
    processing_ms: int,
    output_name: str,
) -> None:
    normalized_counts = empty_class_counts()
    normalized_counts.update({code: int(class_counts.get(code, 0)) for code in CLASS_CODES})
    with connection(settings) as con:
        con.execute(
            "UPDATE inspections SET models_used = ?, total_detections = ?, class_summary = ?, "
            "processing_ms = ?, output_name = ?, status = 'completed', error_message = NULL, "
            "finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
            (model, total_detections, json.dumps(normalized_counts), processing_ms, output_name, inspection_id),
        )


def fail_inspection(settings: Settings, inspection_id: int, message: str) -> None:
    """Keep a concise failure record without disclosing server internals."""
    with connection(settings) as con:
        con.execute(
            "UPDATE inspections SET status = 'failed', error_message = ?, "
            "finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
            (message[:300], inspection_id),
        )


def create_video_inspection(
    settings: Settings, *, filename: str, confidence: float, frames_total: int
) -> int:
    with connection(settings) as con:
        cursor = con.execute(
            "INSERT INTO inspections (input_type, filename, conf_threshold, nms_mode, status, frames_total, class_summary) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("video", filename, confidence, "end2end", "queued", frames_total, json.dumps(empty_class_counts())),
        )
        return int(cursor.lastrowid)


def create_webcam_inspection(settings: Settings, *, confidence: float) -> int:
    with connection(settings) as con:
        cursor = con.execute(
            "INSERT INTO inspections (input_type, conf_threshold, nms_mode, status, class_summary) "
            "VALUES (?, ?, ?, ?, ?)",
            ("webcam", confidence, "end2end", "processing", json.dumps(empty_class_counts())),
        )
        return int(cursor.lastrowid)


def mark_video_processing(settings: Settings, inspection_id: int) -> None:
    with connection(settings) as con:
        con.execute("UPDATE inspections SET status = 'processing' WHERE id = ? AND status = 'queued'", (inspection_id,))


def update_video_progress(
    settings: Settings,
    inspection_id: int,
    *,
    frames_processed: int,
    frames_with_detections: int,
    class_counts: Mapping[str, int],
) -> None:
    counts = empty_class_counts()
    counts.update({code: int(class_counts.get(code, 0)) for code in CLASS_CODES})
    with connection(settings) as con:
        con.execute(
            "UPDATE inspections SET frames_processed = ?, frames_with_detections = ?, total_detections = ?, "
            "class_summary = ? WHERE id = ?",
            (frames_processed, frames_with_detections, sum(counts.values()), json.dumps(counts), inspection_id),
        )


def finish_video_inspection(
    settings: Settings,
    inspection_id: int,
    *,
    status: str,
    class_counts: Mapping[str, int],
    frames_processed: int,
    frames_with_detections: int,
    processing_ms: int,
    models_used: str | None = None,
    output_name: str | None = None,
    error_message: str | None = None,
) -> None:
    counts = empty_class_counts()
    counts.update({code: int(class_counts.get(code, 0)) for code in CLASS_CODES})
    with connection(settings) as con:
        con.execute(
            "UPDATE inspections SET status = ?, models_used = ?, total_detections = ?, class_summary = ?, "
            "frames_processed = ?, frames_with_detections = ?, processing_ms = ?, output_name = ?, "
            "error_message = ?, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
            (
                status,
                models_used,
                sum(counts.values()),
                json.dumps(counts),
                frames_processed,
                frames_with_detections,
                processing_ms,
                output_name,
                error_message[:300] if error_message else None,
                inspection_id,
            ),
        )


def get_inspection(settings: Settings, inspection_id: int) -> dict[str, Any] | None:
    with connection(settings) as con:
        row = con.execute("SELECT * FROM inspections WHERE id = ?", (inspection_id,)).fetchone()
    if row is None:
        return None
    return _inspection_row(row)


def list_inspections(settings: Settings, *, limit: int, offset: int) -> list[dict[str, Any]]:
    """Return a bounded newest-first inspection page using the created-time index."""
    with connection(settings) as con:
        rows = con.execute(
            "SELECT * FROM inspections ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
    return [_inspection_row(row) for row in rows]


def dashboard_snapshot(settings: Settings, *, recent_limit: int = 5) -> dict[str, Any]:
    """Read dashboard totals and a bounded recent page from one SQLite connection.

    Detection and class totals deliberately include completed inspections only. A
    failed or in-progress session remains a session for history purposes, but must
    not be represented as a successful detection result.
    """
    with connection(settings) as con:
        totals = con.execute(
            "SELECT COUNT(*) AS total_inspections, "
            "COALESCE(SUM(CASE WHEN status = 'completed' THEN total_detections ELSE 0 END), 0) "
            "AS total_detections FROM inspections"
        ).fetchone()
        summaries = con.execute(
            "SELECT class_summary FROM inspections WHERE status = 'completed'"
        ).fetchall()
        recent_rows = con.execute(
            "SELECT * FROM inspections ORDER BY created_at DESC, id DESC LIMIT ?",
            (recent_limit,),
        ).fetchall()

    class_counts = empty_class_counts()
    for summary in summaries:
        normalized = normalize_class_counts(summary["class_summary"])
        for code in CLASS_CODES:
            class_counts[code] += normalized[code]
    return {
        "total_inspections": int(totals["total_inspections"]),
        "total_detections": int(totals["total_detections"]),
        "class_counts": class_counts,
        "recent_inspections": [_inspection_row(row) for row in recent_rows],
    }


def delete_inspection(settings: Settings, inspection_id: int) -> bool:
    """Delete only the requested inspection row in its own short transaction."""
    with connection(settings) as con:
        cursor = con.execute("DELETE FROM inspections WHERE id = ?", (inspection_id,))
        return cursor.rowcount == 1


def _inspection_row(row: Any) -> dict[str, Any]:
    result = dict(row)
    result["class_summary"] = normalize_class_counts(result["class_summary"])
    return result
