"""Structured, privacy-aware observability for CineAgent services.

Events are emitted as JSON to stdout, which Cloud Run/GKE's Google Cloud Logging
integration automatically parses.  Raw user and model content is deliberately
disabled by default; enable it only for an approved, access-controlled debugging
environment with ``CINEAGENT_LOG_CONTENT=true``.
"""
import contextvars
import hashlib
import json
import logging
import os
import sys
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, Optional


request_id_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "request_id", default=None
)

_CONTENT_LIMIT = int(os.getenv("CINEAGENT_LOG_CONTENT_MAX_CHARS", "2000"))
_LOG_CONTENT = os.getenv("CINEAGENT_LOG_CONTENT", "false").lower() == "true"


class CloudJsonFormatter(logging.Formatter):
    """Formats records as Google Cloud Logging-compatible JSON."""

    def format(self, record: logging.LogRecord) -> str:
        event: Dict[str, Any] = {
            "severity": record.levelname,
            "message": record.getMessage(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service": os.getenv("K_SERVICE", "cineagent-api"),
        }
        request_id = request_id_ctx.get()
        if request_id:
            event["request_id"] = request_id
        fields = getattr(record, "structured_fields", None)
        if fields:
            event.update(fields)
        if record.exc_info:
            event["exception"] = "".join(traceback.format_exception(*record.exc_info))
        return json.dumps(event, default=str, ensure_ascii=False)


def configure_logging() -> None:
    """Configure process-wide JSON logging once, suitable for Cloud Logging."""
    root = logging.getLogger()
    if getattr(root, "_cineagent_configured", False):
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(CloudJsonFormatter())
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())
    root._cineagent_configured = True  # type: ignore[attr-defined]


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def log_event(
    logger: logging.Logger,
    event: str,
    *,
    level: int = logging.INFO,
    **fields: Any,
) -> None:
    """Write a queryable structured event without interpolating untrusted data."""
    logger.log(level, event, extra={"structured_fields": {"event": event, **fields}})


def content_metadata(content: Optional[str], field_name: str) -> Dict[str, Any]:
    """Return safe content metadata; raw text is explicit opt-in and bounded."""
    value = content or ""
    metadata: Dict[str, Any] = {
        f"{field_name}_chars": len(value),
        f"{field_name}_sha256": hashlib.sha256(value.encode("utf-8")).hexdigest(),
    }
    if _LOG_CONTENT:
        metadata[field_name] = value[:_CONTENT_LIMIT]
        metadata[f"{field_name}_truncated"] = len(value) > _CONTENT_LIMIT
    return metadata
