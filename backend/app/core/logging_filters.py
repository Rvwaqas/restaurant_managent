import logging
import re

TOKEN_REGEX = re.compile(r'([?&]token=)[^& \t\n\r"\'\)]+')


class TokenRedactingFilter(logging.Filter):
    """
    Sanitizes access logs and application logs to ensure JWT tokens
    passed as query parameters (e.g. /ws?token=XYZ) are replaced with token=***.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = TOKEN_REGEX.sub(r"\g<1>***", record.msg)

        if record.args:
            if isinstance(record.args, tuple):
                record.args = tuple(
                    TOKEN_REGEX.sub(r"\g<1>***", str(arg)) if isinstance(arg, str) else arg
                    for arg in record.args
                )
            elif isinstance(record.args, dict):
                record.args = {
                    k: (TOKEN_REGEX.sub(r"\g<1>***", str(v)) if isinstance(v, str) else v)
                    for k, v in record.args.items()
                }

        return True


def apply_token_redaction():
    """Applies TokenRedactingFilter to root and uvicorn loggers."""
    redacting_filter = TokenRedactingFilter()
    target_loggers = [
        logging.getLogger(),
        logging.getLogger("uvicorn"),
        logging.getLogger("uvicorn.access"),
        logging.getLogger("uvicorn.error"),
        logging.getLogger("pos"),
    ]
    for lgr in target_loggers:
        for handler in lgr.handlers:
            handler.addFilter(redacting_filter)
        lgr.addFilter(redacting_filter)

