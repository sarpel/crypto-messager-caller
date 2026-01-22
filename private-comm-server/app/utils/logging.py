import logging
import json
import uuid
from typing import Optional
from contextvars import ContextVar

request_id: ContextVar[str] = ContextVar("request_id", default="")


class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id.get(),
        }

        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        if hasattr(record, "extra_data") and record.extra_data:
            log_data.update(record.extra_data)

        return json.dumps(log_data)


class CorrelationLogger:
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        handler = logging.StreamHandler()
        handler.setFormatter(JSONFormatter())
        self.logger.addHandler(handler)
        self.logger.setLevel(logging.INFO)

    def info(self, msg: str, **kwargs):
        extra = kwargs.pop("extra", {})
        extra_data = kwargs
        record = self.logger.makeRecord(
            self.logger.name, logging.INFO, msg, (), extra=extra
        )
        record.extra_data = extra_data
        self.logger.handle(record)

    def error(self, msg: str, exc_info=None, **kwargs):
        extra = kwargs.pop("extra", {})
        extra_data = kwargs
        record = self.logger.makeRecord(
            self.logger.name, logging.ERROR, msg, (), exc_info=exc_info, extra=extra
        )
        record.extra_data = extra_data
        self.logger.handle(record)

    def warning(self, msg: str, **kwargs):
        extra = kwargs.pop("extra", {})
        extra_data = kwargs
        record = self.logger.makeRecord(
            self.logger.name, logging.WARNING, msg, (), extra=extra
        )
        record.extra_data = extra_data
        self.logger.handle(record)


def setup_logging():
    logging.basicConfig(level=logging.INFO)
    logging.root.handlers = []


def set_request_id(rid: str = None):
    if rid is None:
        rid = str(uuid.uuid4())
    request_id.set(rid)
    return rid


def get_request_id() -> str:
    return request_id.get()
