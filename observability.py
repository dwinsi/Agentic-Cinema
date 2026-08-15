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


from dotenv import load_dotenv

load_dotenv()

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
    """Configure process-wide JSON logging, streaming to stdout and GCP Cloud Logging API."""
    root = logging.getLogger()
    if getattr(root, "_cineagent_configured", False):
        return

    root.handlers.clear()

    # 1. Local stdout JSON Handler (for terminal & Cloud Run stdout ingestion)
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(CloudJsonFormatter())
    root.addHandler(stdout_handler)

    # 2. Direct GCP Cloud Logging API Network Transport (ships logs anywhere code runs)
    project_id = os.getenv("GCP_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT")
    disable_direct = os.getenv("DISABLE_GCP_DIRECT_LOGGING", "false").lower() == "true"

    if not disable_direct and project_id:
        try:
            import atexit
            import google.cloud.logging
            from google.cloud.logging.handlers import CloudLoggingHandler
            from google.cloud.logging_v2.handlers.transports import BackgroundThreadTransport

            client = google.cloud.logging.Client(project=project_id)
            gcp_handler = CloudLoggingHandler(
                client,
                name=os.getenv("K_SERVICE", "cineagent-api"),
                transport=BackgroundThreadTransport
            )
            root.addHandler(gcp_handler)
            atexit.register(gcp_handler.flush)

            log_event(
                root,
                "gcp_direct_logging_attached",
                project_id=project_id,
                log_name=os.getenv("K_SERVICE", "cineagent-api"),
            )
        except Exception as e:
            root.warning("Direct GCP Cloud Logging transport skipped: %s", e)

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
