import io
import json
from urllib.error import HTTPError, URLError

import pytest

from app import openrouter
from app.openrouter import OpenRouterClient, OpenRouterConfigError, OpenRouterRequestError
from app.security import hash_password, verify_password


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def fake_urlopen(monkeypatch, *, body=None, error=None):
    captured = {}

    def _urlopen(request, timeout):
        captured["payload"] = json.loads(request.data)
        captured["auth"] = request.get_header("Authorization")
        if error:
            raise error
        return FakeResponse(body if isinstance(body, bytes) else json.dumps(body).encode())

    monkeypatch.setattr(openrouter, "urlopen", _urlopen)
    return captured


def completion(content) -> dict:
    return {"choices": [{"message": {"content": content}}]}


def test_requires_api_key(monkeypatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(OpenRouterConfigError):
        OpenRouterClient()


def test_chat_sends_model_and_messages(monkeypatch) -> None:
    captured = fake_urlopen(monkeypatch, body=completion("  4  "))
    assert OpenRouterClient(api_key="key").chat("2+2") == "4"
    assert captured["auth"] == "Bearer key"
    assert captured["payload"] == {
        "model": "openai/gpt-oss-120b",
        "messages": [{"role": "user", "content": "2+2"}],
    }


def test_content_parts_are_joined(monkeypatch) -> None:
    fake_urlopen(monkeypatch, body=completion([{"type": "text", "text": "a"}, {"type": "text", "text": "b"}, "x"]))
    assert OpenRouterClient(api_key="key").chat("hi") == "ab"


@pytest.mark.parametrize(
    ("body", "message"),
    [
        (b"not json", "OpenRouter returned invalid JSON."),
        ({"choices": []}, "OpenRouter response did not include choices[0].message.content."),
        (completion(""), "OpenRouter returned an empty response message."),
        (completion(None), "OpenRouter returned an empty response message."),
    ],
)
def test_bad_responses_raise(monkeypatch, body, message) -> None:
    fake_urlopen(monkeypatch, body=body)
    with pytest.raises(OpenRouterRequestError) as exc_info:
        OpenRouterClient(api_key="key").chat("hi")
    assert exc_info.value.message == message


def http_error(code: int) -> HTTPError:
    return HTTPError(openrouter.OPENROUTER_API_URL, code, "error", {}, io.BytesIO(b"upstream detail"))


def test_auth_failure_is_explicit(monkeypatch) -> None:
    fake_urlopen(monkeypatch, error=http_error(401))
    with pytest.raises(OpenRouterRequestError) as exc_info:
        OpenRouterClient(api_key="key").chat("hi")
    assert exc_info.value.status_code == 401
    assert "Check OPENROUTER_API_KEY" in exc_info.value.message


def test_http_error_includes_body(monkeypatch) -> None:
    fake_urlopen(monkeypatch, error=http_error(500))
    with pytest.raises(OpenRouterRequestError) as exc_info:
        OpenRouterClient(api_key="key").chat("hi")
    assert exc_info.value.message == "OpenRouter request failed with status 500: upstream detail"


def test_network_error_is_explicit(monkeypatch) -> None:
    fake_urlopen(monkeypatch, error=URLError("no route"))
    with pytest.raises(OpenRouterRequestError) as exc_info:
        OpenRouterClient(api_key="key").chat("hi")
    assert exc_info.value.message == "Failed to reach OpenRouter: no route"


def test_password_hashing() -> None:
    stored = hash_password("secret-pass")
    assert stored != hash_password("secret-pass")  # salted
    assert verify_password("secret-pass", stored)
    assert not verify_password("wrong-pass", stored)
    assert not verify_password("secret-pass", "")
    assert not verify_password("secret-pass", "md5$aa$bb")
