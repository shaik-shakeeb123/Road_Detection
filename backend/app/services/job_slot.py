"""Shared single-job coordination for video jobs and future webcam sessions."""

from __future__ import annotations

import threading


class JobSlot:
    """Allow only one active video job or webcam session in this process."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._inspection_id: int | None = None
        self._kind: str | None = None
        self._cancel_event = threading.Event()

    def acquire(self, inspection_id: int, kind: str) -> bool:
        with self._lock:
            if self._inspection_id is not None:
                return False
            self._inspection_id = inspection_id
            self._kind = kind
            self._cancel_event.clear()
            return True

    def release(self, inspection_id: int) -> None:
        with self._lock:
            if self._inspection_id == inspection_id:
                self._inspection_id = None
                self._kind = None
                self._cancel_event.clear()

    def request_cancel(self, inspection_id: int) -> bool:
        with self._lock:
            if self._inspection_id != inspection_id:
                return False
            self._cancel_event.set()
            return True

    def cancelled(self, inspection_id: int) -> bool:
        with self._lock:
            return self._inspection_id == inspection_id and self._cancel_event.is_set()

    def active(self) -> tuple[int | None, str | None]:
        with self._lock:
            return self._inspection_id, self._kind
