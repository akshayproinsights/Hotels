"""
Retry helper for transient Supabase/httpx network errors.

The sync postgrest client reuses a persistent HTTP/2 connection pool.
Under concurrent load, sockets can temporarily become unavailable
(EAGAIN / errno 11), producing httpx.ReadError or httpx.ConnectError.
These are safe to retry 2-3 times with a short back-off.
"""

import time
import logging
import functools
from typing import Callable, TypeVar, Type, Tuple

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable)

# Errors that are safe to retry (transient network / socket issues)
_RETRYABLE_MESSAGES = (
    "Resource temporarily unavailable",  # EAGAIN errno 11
    "Connection reset by peer",
    "EOF occurred in violation of protocol",
    "Connection refused",
)


def _is_retryable(exc: Exception) -> bool:
    msg = str(exc)
    return any(pattern in msg for pattern in _RETRYABLE_MESSAGES)


def with_retry(
    max_attempts: int = 3,
    initial_delay: float = 0.2,
    backoff_factor: float = 2.0,
) -> Callable[[F], F]:
    """
    Decorator that retries a function on transient network errors.

    Usage:
        @with_retry(max_attempts=3)
        def my_supabase_call():
            ...
    """
    def decorator(fn: F) -> F:
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            delay = initial_delay
            last_exc: Exception | None = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return fn(*args, **kwargs)
                except Exception as exc:
                    if not _is_retryable(exc):
                        raise
                    last_exc = exc
                    if attempt < max_attempts:
                        logger.warning(
                            f"[retry] {fn.__name__} attempt {attempt}/{max_attempts} "
                            f"failed with transient error: {exc}. "
                            f"Retrying in {delay:.2f}s…"
                        )
                        time.sleep(delay)
                        delay *= backoff_factor
                    else:
                        logger.error(
                            f"[retry] {fn.__name__} failed after {max_attempts} attempts: {exc}"
                        )
            raise last_exc  # type: ignore[misc]
        return wrapper  # type: ignore[return-value]
    return decorator


def supabase_execute(query, max_attempts: int = 3, initial_delay: float = 0.2):
    """
    Execute a postgrest query with automatic retry on transient errors.

    Usage:
        result = supabase_execute(
            supabase.table("bookings").select("*").order("check_in")
        )
        return result.data
    """
    delay = initial_delay
    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return query.execute()
        except Exception as exc:
            if not _is_retryable(exc):
                raise
            last_exc = exc
            if attempt < max_attempts:
                logger.warning(
                    f"[supabase_execute] attempt {attempt}/{max_attempts} "
                    f"failed with transient error: {exc}. "
                    f"Retrying in {delay:.2f}s…"
                )
                time.sleep(delay)
                delay *= 2.0
            else:
                logger.error(
                    f"[supabase_execute] failed after {max_attempts} attempts: {exc}"
                )
    raise last_exc  # type: ignore[misc]

