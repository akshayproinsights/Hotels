"""
Centralized Gemini client helper with Vertex AI primary and API Key fallback.

Priority order for every generate_content call:
  1. Vertex AI (project=settings.vertex_project, location=settings.vertex_location) via ADC / impersonated SA
  2. Google AI Studio (settings.gemini_api_key) — paid key
  3. Google AI Studio (settings.gemini_api_key_free) — free-tier emergency key

All tiers are tried transparently.
"""
import logging
import threading
from typing import Optional, Any

from google import genai
from google.genai import types
from app.config import settings

logger = logging.getLogger(__name__)

# ── Singletons ────────────────────────────────────────────────────────────────
_vertex_client:  Optional[genai.Client] = None
_paid_client:    Optional[genai.Client] = None
_free_client:    Optional[genai.Client] = None

_lock = threading.Lock()


def _get_vertex_client() -> Optional[genai.Client]:
    """Return a cached Vertex AI client. None if configuration or ADC is unavailable."""
    global _vertex_client
    if _vertex_client is None:
        with _lock:
            if _vertex_client is None:
                project = settings.vertex_project
                location = settings.vertex_location
                if not project:
                    logger.debug("[GeminiClient] Vertex AI not configured (VERTEX_PROJECT not set). Skipping Tier 1.")
                    return None
                try:
                    c = genai.Client(
                        vertexai=True,
                        project=project,
                        location=location,
                    )
                    _vertex_client = c
                    logger.info("[GeminiClient] Vertex AI client initialized (project=%s, location=%s)",
                                project, location)
                except Exception as e:
                    logger.warning("[GeminiClient] Vertex AI client init failed (credentials missing?): %s", e)
                    _vertex_client = None
    return _vertex_client


def _get_paid_client() -> Optional[genai.Client]:
    """Return a cached AI Studio client backed by settings.gemini_api_key."""
    global _paid_client
    if _paid_client is None:
        with _lock:
            if _paid_client is None:
                try:
                    key = settings.gemini_api_key
                    if key:
                        _paid_client = genai.Client(api_key=key)
                        logger.info("[GeminiClient] Paid API-key client initialized")
                    else:
                        logger.warning("[GeminiClient] GEMINI_API_KEY not set")
                except Exception as e:
                    logger.warning("[GeminiClient] Paid client init failed: %s", e)
    return _paid_client


def _get_free_client() -> Optional[genai.Client]:
    """Return a cached AI Studio client backed by settings.gemini_api_key_free."""
    global _free_client
    if _free_client is None:
        with _lock:
            if _free_client is None:
                try:
                    key = settings.gemini_api_key_free
                    # Only create a separate client if the free key is different from paid
                    if key and key != settings.gemini_api_key:
                        _free_client = genai.Client(api_key=key)
                        logger.info("[GeminiClient] Free API-key client initialized")
                    else:
                        # Reuse paid client
                        _free_client = _get_paid_client()
                except Exception as e:
                    logger.warning("[GeminiClient] Free client init failed: %s", e)
    return _free_client


def _is_auth_or_config_error(exc: Exception) -> bool:
    """Return True for auth/config errors that warrant trying the next tier."""
    msg = str(exc).lower()
    return (
        "credentials" in msg
        or "unauthenticated" in msg
        or "permission" in msg
        or "not found" in msg
        or "invalid argument" in msg
        or "impersonat" in msg
        or "403" in msg
        or "401" in msg
        or "404" in msg
    )


def _is_quota_error(exc: Exception) -> bool:
    """Return True for quota/rate-limit errors."""
    msg = str(exc).lower()
    return (
        "resource_exhausted" in msg
        or "429" in msg
        or "quota" in msg
        or "rate" in msg
        or "prepayment credits are depleted" in msg
    )


def generate_content_robust(
    model: str,
    contents: Any,
    config: Optional[types.GenerateContentConfig] = None,
    use_free_key: bool = True,
) -> Any:
    """
    Call generate_content with automatic Vertex AI -> API Key fallback.

    Tier 1: Vertex AI (project=settings.vertex_project, location=settings.vertex_location)
    Tier 2: Google AI Studio paid key (settings.gemini_api_key)
    Tier 3: Google AI Studio free key (settings.gemini_api_key_free) - only if use_free_key=True

    Raises the last exception if all tiers fail.
    """
    last_exc: Optional[Exception] = None

    # ── Tier 1: Vertex AI ─────────────────────────────────────────────────────
    vertex = _get_vertex_client()
    if vertex is not None:
        try:
            resp = vertex.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            logger.info("[GeminiClient] Tier-1 Vertex AI OK | model=%s", model)
            print(f"[GeminiClient] Tier-1 Vertex AI OK | model={model}", flush=True)
            return resp
        except Exception as e:
            last_exc = e
            if _is_auth_or_config_error(e) or _is_quota_error(e):
                logger.warning(
                    "[GeminiClient] Vertex AI failed for model=%s (%s), falling back to API key",
                    model, type(e).__name__
                )
            else:
                logger.error(
                    "[GeminiClient] Vertex AI unexpected error for model=%s: %s - falling back",
                    model, e
                )

    # ── Tier 2: Paid API Key ──────────────────────────────────────────────────
    paid = _get_paid_client()
    if paid is not None:
        try:
            resp = paid.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            logger.info("[GeminiClient] Tier-2 paid API key OK | model=%s", model)
            print(f"[GeminiClient] Tier-2 paid API key OK | model={model}", flush=True)
            return resp
        except Exception as e:
            last_exc = e
            if _is_quota_error(e):
                logger.warning(
                    "[GeminiClient] Paid API key quota exhausted for model=%s, trying free key",
                    model
                )
            else:
                logger.error("[GeminiClient] Paid API key error for model=%s: %s", model, e)

    # ── Tier 3: Free API Key (emergency) ──────────────────────────────────────
    if use_free_key:
        free = _get_free_client()
        if free is not None:
            try:
                resp = free.models.generate_content(
                    model=model,
                    contents=contents,
                    config=config,
                )
                logger.info("[GeminiClient] Tier-3 free API key OK | model=%s", model)
                print(f"[GeminiClient] Tier-3 free API key OK | model={model}", flush=True)
                return resp
            except Exception as e:
                last_exc = e
                logger.error("[GeminiClient] Free API key also failed for model=%s: %s", model, e)

    raise last_exc or RuntimeError(f"All Gemini tiers failed for model={model}")


def reset_clients() -> None:
    """Force re-initialization of all clients (useful after credential rotation)."""
    global _vertex_client, _paid_client, _free_client
    with _lock:
        _vertex_client = None
        _paid_client   = None
        _free_client   = None
    logger.info("[GeminiClient] All client singletons reset")
