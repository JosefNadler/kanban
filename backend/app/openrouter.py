import json
import os
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "openai/gpt-oss-120b"


class OpenRouterConfigError(RuntimeError):
    pass


@dataclass
class OpenRouterRequestError(RuntimeError):
    message: str
    status_code: int | None = None


class OpenRouterClient:
    def __init__(self, api_key: str | None = None, model: str = OPENROUTER_MODEL):
        key = api_key if api_key is not None else os.getenv("OPENROUTER_API_KEY")
        if not key:
            raise OpenRouterConfigError("OPENROUTER_API_KEY is not configured.")

        self._api_key = key
        self._model = model

    def chat(self, prompt: str) -> str:
        return self.chat_messages([{"role": "user", "content": prompt}])

    def chat_messages(self, messages: list[dict[str, str]]) -> str:
        payload = {
            "model": self._model,
            "messages": messages,
        }

        request = Request(
            OPENROUTER_API_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=30) as response:
                raw_body = response.read()
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            if exc.code in (401, 403):
                raise OpenRouterRequestError(
                    "OpenRouter authentication failed. Check OPENROUTER_API_KEY.",
                    status_code=exc.code,
                ) from exc
            raise OpenRouterRequestError(
                f"OpenRouter request failed with status {exc.code}: {body}",
                status_code=exc.code,
            ) from exc
        except URLError as exc:
            raise OpenRouterRequestError(
                f"Failed to reach OpenRouter: {exc.reason}",
            ) from exc

        try:
            response_payload = json.loads(raw_body)
        except json.JSONDecodeError as exc:
            raise OpenRouterRequestError("OpenRouter returned invalid JSON.") from exc

        try:
            content = response_payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise OpenRouterRequestError(
                "OpenRouter response did not include choices[0].message.content.",
            ) from exc

        normalized_content = self._normalize_content(content)
        if not normalized_content:
            raise OpenRouterRequestError("OpenRouter returned an empty response message.")

        return normalized_content

    @staticmethod
    def _normalize_content(content: Any) -> str:
        if isinstance(content, str):
            return content.strip()

        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text")
                    if isinstance(text, str):
                        parts.append(text)
            return "".join(parts).strip()

        return ""
