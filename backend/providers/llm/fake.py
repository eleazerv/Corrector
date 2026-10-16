from collections.abc import Callable

from .base import LlmJson, LlmUsage, PermanentLlmError, TransientLlmError


class FakeLlm:
    """LLM palsu buat test (gratis, deterministik).

    responses:
      - list[dict]  -> diambil berurutan, yang terakhir diulang
      - callable(messages) -> dict  -> jawaban tergantung prompt
    mode: "ok" | "transient" | "permanent"
    """

    name = "fake"
    model = "fake"

    def __init__(self, responses: list[dict] | Callable[[list[dict]], dict] | None = None,
                 mode: str = "ok"):
        self.responses = responses if responses is not None else [{"ok": True}]
        self.mode = mode
        self.calls: list[list[dict]] = []

    async def start(self) -> None:
        pass

    async def close(self) -> None:
        pass

    async def complete_json(self, messages: list[dict], *, temperature: float = 0.0,
                            max_tokens: int | None = None, thinking: bool = False) -> LlmJson:
        self.calls.append(messages)
        if self.mode == "transient":
            raise TransientLlmError("fake transient")
        if self.mode == "permanent":
            raise PermanentLlmError("fake permanent")
        if callable(self.responses):
            data = self.responses(messages)
        else:
            i = min(len(self.calls) - 1, len(self.responses) - 1)
            data = self.responses[i]
        chars = sum(len(str(m.get("content", ""))) for m in messages)
        return LlmJson(data=dict(data),
                       usage=LlmUsage(input_tokens=chars // 4, output_tokens=50),
                       model="fake")
