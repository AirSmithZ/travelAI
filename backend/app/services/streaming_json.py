import re

_REPLY_KEY = re.compile(r'"reply"\s*:\s*"', re.DOTALL)
_TITLE_KEY = re.compile(r'"title"\s*:\s*"', re.DOTALL)
_LABEL_KEY = re.compile(r'"label"\s*:\s*"', re.DOTALL)


def _extract_json_string_value(accumulated: str, start: int) -> str:
    out: list[str] = []
    i = start
    while i < len(accumulated):
        ch = accumulated[i]
        if ch == "\\" and i + 1 < len(accumulated):
            nxt = accumulated[i + 1]
            if nxt == "n":
                out.append("\n")
            elif nxt == "t":
                out.append("\t")
            elif nxt in {'"', "\\", "/"}:
                out.append(nxt)
            elif nxt == "u" and i + 5 < len(accumulated):
                try:
                    out.append(chr(int(accumulated[i + 2 : i + 6], 16)))
                    i += 6
                    continue
                except ValueError:
                    out.append(nxt)
            else:
                out.append(nxt)
            i += 2
            continue
        if ch == '"':
            break
        out.append(ch)
        i += 1
    return "".join(out)


def extract_streaming_reply(accumulated: str) -> str:
    """从部分 JSON 提取 reply 字段已生成的文本，供流式 UI 展示。"""
    match = _REPLY_KEY.search(accumulated)
    if not match:
        return ""
    return _extract_json_string_value(accumulated, match.end())


def extract_streaming_itinerary_preview(accumulated: str) -> str:
    """从部分 itinerary JSON 提取 title / 最近 day label，供 generate 流式 UI。"""
    parts: list[str] = []
    title_match = _TITLE_KEY.search(accumulated)
    if title_match:
        title = _extract_json_string_value(accumulated, title_match.end())
        if title:
            parts.append(title)

    label_matches = list(_LABEL_KEY.finditer(accumulated))
    if label_matches:
        label = _extract_json_string_value(accumulated, label_matches[-1].end())
        if label and (not parts or label not in parts[0]):
            parts.append(label)

    return " · ".join(parts) if parts else ""
