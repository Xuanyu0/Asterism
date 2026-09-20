#!/usr/bin/env python3
"""
架构图代码块的纯空白重排脚本。

对文档中第一个 ```text 围栏块内的行做空白规范化，非空白内容逐字保留：
- 规则 1（目录项块）：块内条目名与续行 payload 对齐到统一列 P；
  P = I + measure("├── ") + max(measure(条目名)) + 2，I 为该块的目录项缩进。
- 规则 2（↓ 流块）：组内第 k 列起点满足 C1 = 4、C_{k+1} = C_k + W_k + 4，
  W_k 为组内所有具备第 k 段的行的该段最大长度。

宽度口径（显示宽度，与本仓库项目级 AGENTS.md 的排版一致）：
- East Asian Width ∈ {W, F} 的字符（CJK 等）记 2 格；
- 其余字符（ASCII、盒线 ├ ─ └ │、箭头 ↓ ← → 等歧义 A 字符）记 1 格。

规则依据（FOR-AGENTS/分层森林图详细规则.md §4「层级即缩进」）：
- 缩进 = 层级，且是相对规则：根固定 0，每下沉一级 +4。
- 规则 1 的目录项缩进 I 由该块首个条目行决定（常规形态 I = 12，根携带目录树时 I = 8）。
- 层属性行（节点缩进 + 4）不属于本脚本范围，一律不动。
- 目录项续行以 │ 引导，纯对齐可省 │ → 续行的判据是「缩进 ≥ I 且非条目行」，
  而非首字符是否为 │。
- 列内单个空格不是分隔符，故「↓ 单图 x / 跨图 y」整体是一列。

用法：
    python3 scripts/format_architecture_blocks.py [--check | --write] [--doc PATH]

退出码：0 = 全部合规；1 = 存在不合规行；2 = 入参或文档错误。
"""

from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path
from typing import TypedDict

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DOC = ROOT / "AGENTS.md"

LAYER_INDENT = 4
# "├── " 的字符数（3 盒线 + 1 空格），仅用于按字符切分 body / 定位 payload 下标；
# 视觉宽度一律走 measure()，不复用本常量。
BOX_PREFIX_LEN = 4
ANNOTATION = "←"
FIELD_SEP_RE = re.compile(r"≝|⊃|=")
CONTINUOUS_SPACE_RE = re.compile(r"\s{2,}")

TextBlock = tuple[int, int]


class Finding(TypedDict):
    """一条不合规明细。exp/act = 期望 / 实际列位。"""

    line: int
    rule: int
    exp: str
    act: str
    note: str


def indent_width(line: str) -> int:
    """行首空格数。"""
    return len(line) - len(line.lstrip(" "))


def entry_indent(line: str) -> int | None:
    """条目行候选的缩进；缩进后不是盒线 ├── / └── 时返回 None。"""
    indent = indent_width(line)
    if line[indent:].startswith(("├──", "└──")):
        return indent
    return None


def is_entry_line(line: str, item_indent: int) -> bool:
    """是否属于该目录项块的条目行：缩进恰为 item_indent 且以盒线开头。"""
    return entry_indent(line) == item_indent


def is_cont_line(line: str, item_indent: int) -> bool:
    """该目录项块的续行：缩进 ≥ item_indent 的非空白行，且不是条目行。

    架构语法允许省略引导用的 │（纯对齐续行），故不能以首字符 │ 作判据；
    缩进 ≥ item_indent 的非空行在此层级下非条目即续行。
    """
    return (
        indent_width(line) >= item_indent
        and line.strip() != ""
        and not is_entry_line(line, item_indent)
    )


def is_flow_line(line: str) -> bool:
    """数据流候选行：缩进 4 且非空白。纯空白行视为空行，断开分组。"""
    return indent_width(line) == LAYER_INDENT and line.strip() != ""


def find_first_text_block(lines: list[str]) -> TextBlock | None:
    """定位第一个 ```text 围栏块的内容区间 [start, end)（不含围栏行）。"""
    open_idx = None
    for i, line in enumerate(lines):
        if line.strip() == "```text":
            open_idx = i
            break
    if open_idx is None:
        return None

    for j in range(open_idx + 1, len(lines)):
        if lines[j].strip() == "```":
            return (open_idx + 1, j)
    return None


def parse_entry_parts(body: str) -> tuple[str, str, int]:
    """把「条目名 + payload」拆开。

    返回 (条目名, payload, payload 在 body 内的起始下标)。
    条目名按「先切 ← 注解、再按 ≝/⊃/= 切一次」提取，payload 取条目名之后的
    剩余内容（保留 ← 注解原文）。
    """
    head = body.split(ANNOTATION, 1)[0]
    name = FIELD_SEP_RE.split(head, maxsplit=1)[0].strip()

    name_end = body.find(name) + len(name)
    tail = body[name_end:]
    payload = tail.strip()
    payload_start = name_end + (len(tail) - len(tail.lstrip()))
    return name, payload, payload_start


def parse_cont_parts(line: str) -> tuple[str, int]:
    """拆开续行的缩进 / │ 标记与 payload，返回 (payload, payload 起始列)。

    续行可省略 │（纯对齐），故按实际缩进定位 payload，而非固定去掉首个字符。
    """
    indent = indent_width(line)
    body = line[indent:]
    if body.startswith("│"):
        body = body[1:]
        indent += 1
    payload = body.strip()
    payload_col = indent + (len(body) - len(body.lstrip()))
    return payload, payload_col


def build_entry_line(
    box: str, name: str, payload: str, target_col: int, item_indent: int
) -> str:
    """重写条目行，填充到 target_col（显示列）；无 payload 时不补尾随空格。"""
    prefix = " " * item_indent + box + " "
    if not payload:
        return prefix + name
    return prefix + name + " " * (target_col - measure(prefix + name)) + payload


def build_cont_line(marker: str, payload: str, target_col: int, item_indent: int) -> str:
    """重写续行，填充到 target_col（显示列）；无 payload 时不补尾随空格。"""
    prefix = " " * item_indent + marker
    if not payload:
        return prefix
    return prefix + " " * (target_col - measure(prefix)) + payload


def split_flow_line(text: str) -> tuple[list[str], str]:
    """把流块行切成列。

    行末以 ← 开头（且由 2+ 空格隔开）的段是注解，单独摘出、原文保留。
    """
    parts = CONTINUOUS_SPACE_RE.split(text)
    annotation = ""
    if len(parts) > 1 and parts[-1].startswith(ANNOTATION):
        annotation = parts[-1]
        parts = parts[:-1]
    return [part.strip() for part in parts if part.strip()], annotation


def measure(text: str) -> int:
    """显示宽度：East Asian Width ∈ {W, F} 记 2，其余（含歧义 A）记 1。"""
    return sum(
        2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1 for ch in text
    )


def flow_column_starts(line: str, seg_count: int) -> list[int]:
    """原始行内各段的实际起始位（显示列）。"""
    text = line[LAYER_INDENT:].rstrip()
    starts: list[int] = []
    for match in re.finditer(r"\S+(?: \S+)*", text):
        starts.append(measure(text[: match.start()]) + LAYER_INDENT)
    return starts[:seg_count]


def build_flow_line(segs: list[str], annotation: str, cols: list[int]) -> str:
    """按列起点重写流块行；最后一段之后与注解之前不留多余空白。"""
    out = " " * LAYER_INDENT
    for index, seg in enumerate(segs):
        if index:
            out += " " * (cols[index] - measure(out))
        out += seg
    if annotation:
        out += "  " + annotation
    return out


def trailing_note(original: str, rebuilt: str, exp: str, act: str) -> str:
    """列位相同却仍不合规时，注明差异来自尾随空白而非列位。"""
    if exp == act and original.rstrip() == rebuilt.rstrip():
        return "（仅尾随空白差异）"
    return ""


def plan_rule1_block(
    lines: list[str],
    start: int,
    end: int,
    offset: int,
    expected: dict[int, str],
    findings: list[Finding],
    item_indent: int,
) -> None:
    """为一个目录项块生成期望行与不合规明细。

    item_indent 是该块的目录项缩进，由块首条目行推导后传入：切片、目标列与
    重建都据此进行，故根节点（缩进 0）携带的目录树（条目缩进 8）同样能被对齐。
    """
    entry_idx = [
        k for k in range(start, end) if is_entry_line(lines[k], item_indent)
    ]
    if not entry_idx:
        return

    metas: dict[int, tuple[str, str, str, int]] = {}
    for k in entry_idx:
        rest = lines[k][item_indent:]
        name, payload, payload_start = parse_entry_parts(rest[BOX_PREFIX_LEN:])
        metas[k] = (rest[:3], name, payload, payload_start)

    target_col = (
        item_indent
        + measure("├── ")
        + max(measure(m[1]) for m in metas.values())
        + 2
    )
    last_entry = entry_idx[-1]

    for k in range(start, end):
        original = lines[k]
        if k in metas:
            box, name, payload, payload_start = metas[k]
            rebuilt = build_entry_line(box, name, payload, target_col, item_indent)
            payload_index = item_indent + BOX_PREFIX_LEN + payload_start
            actual_col = measure(original[:payload_index]) if payload else None
        else:
            payload, payload_col = parse_cont_parts(original)
            marker = " " if k > last_entry else "│"
            rebuilt = build_cont_line(marker, payload, target_col, item_indent)
            actual_col = measure(original[:payload_col]) if payload else None

        lineno = offset + k
        expected[lineno] = rebuilt
        if rebuilt != original:
            exp_col = str(target_col) if payload else "-"
            act_col = str(actual_col) if actual_col is not None else "-"
            findings.append(
                {
                    "line": lineno,
                    "rule": 1,
                    "exp": exp_col,
                    "act": act_col,
                    "note": trailing_note(original, rebuilt, exp_col, act_col),
                }
            )


def plan_rule2_block(
    lines: list[str],
    start: int,
    end: int,
    offset: int,
    expected: dict[int, str],
    findings: list[Finding],
) -> None:
    """为一个 ↓ 流块生成期望行与不合规明细。"""
    parsed = [split_flow_line(lines[k][LAYER_INDENT:].rstrip()) for k in range(start, end)]
    seg_count = max(len(segs) for segs, _ in parsed)

    widths: list[int] = []
    for column in range(seg_count):
        widths.append(
            max(measure(segs[column]) for segs, _ in parsed if len(segs) > column)
        )

    cols = [LAYER_INDENT]
    for column in range(seg_count - 1):
        cols.append(cols[-1] + widths[column] + 4)

    for index, (segs, annotation) in enumerate(parsed):
        original = lines[start + index]
        rebuilt = build_flow_line(segs, annotation, cols)

        lineno = offset + start + index
        expected[lineno] = rebuilt
        if rebuilt != original:
            actual_cols = flow_column_starts(original, len(segs))
            exp_cols = ",".join(str(c) for c in cols[: len(segs)])
            act_cols = ",".join(str(c) for c in actual_cols)
            findings.append(
                {
                    "line": lineno,
                    "rule": 2,
                    "exp": exp_cols,
                    "act": act_cols,
                    "note": trailing_note(original, rebuilt, exp_cols, act_cols),
                }
            )


def analyze(lines: list[str], offset: int) -> tuple[dict[int, str], list[Finding], int]:
    """扫描全部块，返回 (期望行映射, 不合规明细, 块数)。"""
    expected: dict[int, str] = {}
    findings: list[Finding] = []
    block_count = 0

    i = 0
    while i < len(lines):
        item_indent = entry_indent(lines[i])
        if item_indent is None:
            i += 1
            continue
        j = i + 1
        while j < len(lines) and (
            is_entry_line(lines[j], item_indent) or is_cont_line(lines[j], item_indent)
        ):
            j += 1
        block_count += 1
        plan_rule1_block(lines, i, j, offset, expected, findings, item_indent)
        i = j

    i = 0
    while i < len(lines):
        if is_flow_line(lines[i]):
            j = i
            while j < len(lines) and is_flow_line(lines[j]):
                j += 1
            if any("↓" in lines[k] for k in range(i, j)):
                block_count += 1
                plan_rule2_block(lines, i, j, offset, expected, findings)
            i = j
        else:
            i += 1

    findings.sort(key=lambda item: item["line"])
    return expected, findings, block_count


def parse_args(args: list[str]) -> tuple[str, Path] | int:
    """解析入参，返回 (模式, 文档路径)；出错返回退出码。"""
    mode = "check"
    doc = DEFAULT_DOC

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == "--check":
            mode = "check"
        elif arg == "--write":
            mode = "write"
        elif arg == "--doc":
            if i + 1 >= len(args):
                print(f"[错误] {arg} 缺少参数")
                return 2
            doc = Path(args[i + 1])
            i += 1
        else:
            print(f"[错误] 未知参数: {arg}")
            return 2
        i += 1

    if not doc.exists():
        print(f"[错误] 文档不存在: {doc}")
        return 2

    return mode, doc


def main() -> int:
    parsed = parse_args(sys.argv[1:])
    if isinstance(parsed, int):
        return parsed
    mode, doc = parsed

    lines = doc.read_text(encoding="utf-8").split("\n")
    block = find_first_text_block(lines)
    if block is None:
        print(f"[错误] 未找到 ```text 围栏块: {doc}")
        return 2

    start, end = block
    expected, findings, block_count = analyze(lines[start:end], start + 1)

    if mode == "write":
        changed = 0
        for lineno, rebuilt in expected.items():
            if lines[lineno - 1] != rebuilt:
                lines[lineno - 1] = rebuilt
                changed += 1
        if changed:
            doc.write_text("\n".join(lines), encoding="utf-8")
        print(f"重排完成：{block_count} 个块，改写 {changed} 行")
        return 0

    for finding in findings:
        print(
            f"[不合规] L{finding['line']} [规则{finding['rule']}]"
            f" 期望列 {finding['exp']}，实际列 {finding['act']}{finding['note']}"
        )
    if findings:
        print(f"检查完成：{block_count} 个块，{len(findings)} 行不合规")
        return 1

    print(f"检查完成：{block_count} 个块，全部合规")
    return 0


if __name__ == "__main__":
    sys.exit(main())
