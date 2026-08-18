"""Shared Gemini resilience config — retries transient errors (like 429
RESOURCE_EXHAUSTED rate limits) automatically instead of letting one flaky
call kill the whole agent turn."""
from google.genai import types

RESILIENT_CONFIG = types.GenerateContentConfig(
    http_options=types.HttpOptions(
        retry_options=types.HttpRetryOptions(initial_delay=2, attempts=4),
    ),
)
