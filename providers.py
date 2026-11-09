"""
LLM providers for J.A.R.V.I.S.

Every provider exposes the same 3 calls, so the brain can fail over between them freely:
    chat(messages, system, tools)  -> {"text": str, "calls": [{"id", "name", "args", "sig"}]}
    vision(jpeg, prompt, json_mode) -> str
    stream(prompt, max_tokens)      -> iterator of text chunks

Messages use one neutral (OpenAI-style) format:
    {"role": "user", "content": "..."}
    {"role": "assistant", "content": "...", "calls": [{"id", "name", "args", "sig"}]}
    {"role": "tool", "id": "...", "name": "...", "content": "<json>"}

Supported out of the box (just put the key in .env):
    Gemini · Groq · OpenRouter · Mistral · GitHub Models · Ollama (local, unlimited) · any OpenAI-compatible URL
"""
from __future__ import annotations

import base64
import json
import os
import uuid

TIMEOUT = 30           # chat / vision: fail fast and fail over
STREAM_TIMEOUT = 240   # code generation can legitimately take a while


class NoVision(Exception):
    pass


def _new_id() -> str:
    return "call_" + uuid.uuid4().hex[:20]


# ====================================================================== Gemini (native SDK)
class GeminiBackend:
    kind = "gemini"
    vision_ok = True

    def __init__(self, client, model: str, stream_client=None):
        self.client, self.model = client, model
        self.stream_client = stream_client or client
        self.label = f"gemini/{model}"
        self._thinking_ok = True

    def _cfg(self, **kw):
        from google.genai import types
        if self._thinking_ok:
            if self.model.startswith("gemini-3"):
                kw["thinking_config"] = types.ThinkingConfig(thinking_level="low")
            elif "2.5-flash" in self.model:
                kw["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
        return types.GenerateContentConfig(**kw)

    def _gen(self, contents, **kw):
        try:
            return self.client.models.generate_content(model=self.model, contents=contents, config=self._cfg(**kw))
        except Exception as exc:
            if self._thinking_ok and "thinking" in str(exc).lower():
                self._thinking_ok = False
                return self.client.models.generate_content(model=self.model, contents=contents, config=self._cfg(**kw))
            raise

    @staticmethod
    def _to_contents(messages):
        from google.genai import types
        out, pending = [], []

        def flush():
            if pending:
                out.append(types.Content(role="user", parts=list(pending)))
                pending.clear()

        for m in messages:
            if m["role"] == "tool":
                p = types.Part.from_function_response(name=m["name"], response={"result": json.loads(m["content"])})
                p.function_response.id = m["id"]
                pending.append(p)
                continue
            flush()
            if m["role"] == "user":
                out.append(types.Content(role="user", parts=[types.Part.from_text(text=m["content"])]))
            else:
                parts = []
                if m.get("content"):
                    parts.append(types.Part.from_text(text=m["content"]))
                for c in m.get("calls", []):
                    p = types.Part(function_call=types.FunctionCall(id=c["id"], name=c["name"], args=c["args"]))
                    # Gemini 3 requires the thought signature it produced; calls made by other providers get the
                    # documented "skip" value so a mixed-provider history still validates.
                    p.thought_signature = c.get("sig") or b"skip_thought_signature_validator"
                    parts.append(p)
                out.append(types.Content(role="model", parts=parts or [types.Part.from_text(text="...")]))
        flush()
        return out

    def chat(self, messages, system, tools, temperature=0.7):
        from google.genai import types
        decls = [types.FunctionDeclaration(name=t["name"], description=t["description"],
                                           parameters_json_schema=t["parameters"]) for t in tools]
        resp = self._gen(
            self._to_contents(messages), system_instruction=system, temperature=temperature,
            tools=[types.Tool(function_declarations=decls)],
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        cand = resp.candidates[0] if resp.candidates else None
        parts = (cand.content.parts if cand and cand.content else None) or []
        text = " ".join(p.text for p in parts if p.text and not getattr(p, "thought", False)).strip()
        calls = [{"id": p.function_call.id or _new_id(), "name": p.function_call.name,
                  "args": dict(p.function_call.args or {}), "sig": p.thought_signature}
                 for p in parts if p.function_call]
        return {"text": text, "calls": calls}

    def vision(self, jpeg, prompt, json_mode=False):
        from google.genai import types
        kw = {"temperature": 0.1}
        if json_mode:
            kw["response_mime_type"] = "application/json"
        resp = self._gen([types.Part.from_bytes(data=jpeg, mime_type="image/jpeg"), prompt], **kw)
        return resp.text or ""

    def stream(self, prompt, max_tokens=32000):
        for chunk in self.stream_client.models.generate_content_stream(
                model=self.model, contents=prompt, config=self._cfg(temperature=0.8, max_output_tokens=max_tokens)):
            if chunk.text:
                yield chunk.text

    def ping(self):
        self.client.models.generate_content(model=self.model, contents="ping", config=self._cfg(max_output_tokens=5))


# ====================================================================== OpenAI-compatible
class OpenAIBackend:
    kind = "openai"

    def __init__(self, name: str, base_url: str, api_key: str, model: str, vision_model: str | None = None,
                 extra_headers: dict | None = None):
        from openai import OpenAI
        self.client = OpenAI(base_url=base_url, api_key=api_key, timeout=TIMEOUT, max_retries=0,
                             default_headers=extra_headers or None)
        self.name, self.model, self.vision_model = name, model, vision_model
        self.label = f"{name}/{model}"
        self.vision_ok = bool(vision_model)

    @staticmethod
    def _to_messages(messages, system):
        out = [{"role": "system", "content": system}]
        for m in messages:
            if m["role"] == "tool":
                out.append({"role": "tool", "tool_call_id": m["id"], "content": m["content"]})
            elif m["role"] == "assistant":
                msg = {"role": "assistant", "content": m.get("content") or ""}
                if m.get("calls"):
                    msg["tool_calls"] = [{"id": c["id"], "type": "function",
                                          "function": {"name": c["name"], "arguments": json.dumps(c["args"])}}
                                         for c in m["calls"]]
                out.append(msg)
            else:
                out.append({"role": "user", "content": m["content"]})
        return out

    def chat(self, messages, system, tools, temperature=0.7):
        resp = self.client.chat.completions.create(
            model=self.model, messages=self._to_messages(messages, system), temperature=temperature,
            tools=[{"type": "function", "function": t} for t in tools], tool_choice="auto", max_tokens=4096,
        )
        msg = resp.choices[0].message
        calls = []
        for tc in msg.tool_calls or []:
            try:
                args = json.loads(tc.function.arguments or "{}") or {}
            except json.JSONDecodeError:
                args = {}
            calls.append({"id": tc.id or _new_id(), "name": tc.function.name, "args": args, "sig": None})
        return {"text": (msg.content or "").strip(), "calls": calls}

    def vision(self, jpeg, prompt, json_mode=False):
        if not self.vision_model:
            raise NoVision(self.label)
        url = "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()
        resp = self.client.chat.completions.create(
            model=self.vision_model, temperature=0.1, max_tokens=800,
            messages=[{"role": "user", "content": [{"type": "text", "text": prompt},
                                                   {"type": "image_url", "image_url": {"url": url}}]}],
        )
        return resp.choices[0].message.content or ""

    def stream(self, prompt, max_tokens=16000):
        for ev in self.client.with_options(timeout=STREAM_TIMEOUT).chat.completions.create(
                model=self.model, stream=True, temperature=0.8, max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}]):
            if ev.choices and ev.choices[0].delta and ev.choices[0].delta.content:
                yield ev.choices[0].delta.content

    def ping(self):
        self.client.chat.completions.create(model=self.model, max_tokens=5,
                                            messages=[{"role": "user", "content": "ping"}])


# ====================================================================== discovery from .env
GEMINI_MODELS = [
    "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash",
    "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3-flash", "gemini-2.5-flash",
    "gemini-flash-latest", "gemini-2.5-flash-lite",
]

# name: (base_url, key env var, default chat model, default vision model, preferred chat models)
OPENAI_COMPATIBLE = {
    "groq": ("https://api.groq.com/openai/v1", "GROQ_API_KEY", "openai/gpt-oss-120b", None,
             ["openai/gpt-oss-120b", "moonshotai/kimi-k2-instruct", "llama-3.3-70b-versatile", "qwen/qwen3-32b"]),
    "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY", "openrouter/free", "openrouter/free", []),
    "mistral": ("https://api.mistral.ai/v1", "MISTRAL_API_KEY", "mistral-small-latest", "mistral-small-latest", []),
    "github": ("https://models.github.ai/inference", "GITHUB_TOKEN", "openai/gpt-4.1-mini", "openai/gpt-4.1-mini", []),
}
GROQ_VISION = ["meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct"]


def _list_models(client) -> set[str]:
    try:
        return {m.id for m in client.models.list()}
    except Exception:
        return set()


def discover() -> list:
    """Build the ordered failover chain from whatever keys are present in the environment."""
    order = [s.strip().lower() for s in os.getenv("JARVIS_PROVIDER_ORDER",
                                                  "gemini,groq,openrouter,mistral,github,ollama,custom").split(",")]
    backends = []
    for name in order:
        try:
            backends += _discover_one(name)
        except Exception as exc:
            print(f"[providers] {name}: skipped ({str(exc)[:80]})")
    return backends


def _discover_one(name: str) -> list:
    if name == "gemini":
        key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not key:
            return []
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=key, http_options=types.HttpOptions(
            timeout=TIMEOUT * 1000, retry_options=types.HttpRetryOptions(attempts=1)))
        try:
            available = {m.name.split("/")[-1] for m in client.models.list()}
        except Exception as exc:
            print(f"[providers] gemini: could not list models ({str(exc)[:60]})")
            available = set()
        wanted = [os.getenv("GEMINI_MODEL")] if os.getenv("GEMINI_MODEL") else []
        models = wanted + [m for m in GEMINI_MODELS if m not in wanted and (not available or m in available)]
        stream_client = genai.Client(api_key=key, http_options=types.HttpOptions(
            timeout=STREAM_TIMEOUT * 1000, retry_options=types.HttpRetryOptions(attempts=1)))
        return [GeminiBackend(client, m, stream_client) for m in models[:6]]

    if name == "ollama":
        model = os.getenv("OLLAMA_MODEL")
        if not model:
            return []
        base = os.getenv("OLLAMA_URL", "http://localhost:11434") + "/v1"
        return [OpenAIBackend("ollama", base, "ollama", model, os.getenv("OLLAMA_VISION_MODEL") or None)]

    if name == "custom":
        base, model = os.getenv("CUSTOM_BASE_URL"), os.getenv("CUSTOM_MODEL")
        if not (base and model):
            return []
        return [OpenAIBackend("custom", base, os.getenv("CUSTOM_API_KEY", "none"), model,
                              os.getenv("CUSTOM_VISION_MODEL") or None)]

    if name in OPENAI_COMPATIBLE:
        base, env, default, vision, prefs = OPENAI_COMPATIBLE[name]
        key = os.getenv(env)
        if not key:
            return []
        model = os.getenv(f"{name.upper()}_MODEL")
        vmodel = os.getenv(f"{name.upper()}_VISION_MODEL") or vision
        headers = {"HTTP-Referer": "https://github.com/open-jarvis/OpenJarvis", "X-Title": "JARVIS"} \
            if name == "openrouter" else None
        probe = OpenAIBackend(name, base, key, model or default, vmodel, headers)
        if not model and (prefs or name == "groq"):
            ids = _list_models(probe.client)
            if ids:
                model = next((p for p in prefs if p in ids), None)
                if name == "groq" and not vmodel:
                    vmodel = next((v for v in GROQ_VISION if v in ids), None)
        if model or vmodel != vision:
            probe = OpenAIBackend(name, base, key, model or default, vmodel, headers)
        return [probe]
    return []
