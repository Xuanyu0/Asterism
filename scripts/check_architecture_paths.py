#!/usr/bin/env python3
"""
项目级 AGENTS.md 架构树路径存在性校验脚本。

提取项目级 AGENTS.md「项目架构（分层森林图 · 顶层视图）」的 ```text 围栏块中记录的
目录路径（层基目录 + 顶层目录项），校验其在仓库中仍然存在。

校验规则依据（见 FOR-AGENTS/分层森林图详细规则.md §4，缩进是相对规则）：
- 层声明行（首字符为 = / ⊂ / ⊃）：运算符后为基目录，` + ` 连接多个基目录。
- 目录项行（以 ├── / └── 起头）：条目名相对该层基目录解析。
- 归属：目录项归属于缩进恰少 4 的最近层声明。层声明即所属节点的三元组
  （节点缩进 + 4），目录项在节点缩进 + 8，故两者相差 +4——层声明在 8 则条目在 12
  （常规形态），根节点自带目录树时层声明在 4、条目在 8。
- 条目名可能自带基目录前缀（如 ui/operation_controller.ts），也可能不自带
  （如 graph_store.ts），故候选集取该层各基目录及其公共前缀的并集去重。

用法：
    python3 scripts/check_architecture_paths.py [--doc PATH]

退出码：0 = 全部路径存活；1 = 存在失效路径；2 = 入参 / 文档错误。
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DOC = ROOT / "AGENTS.md"

ITEM_NAME_SPLIT_RE = re.compile(r"≝|⊃|=")


def extract_text_block(doc_path: Path) -> list[tuple[int, str]]:
    """提取文档中第一个 ```text 围栏块，返回 [(1-based 行号, 行内容), ...]。"""
    lines = doc_path.read_text(encoding="utf-8").splitlines()
    block: list[tuple[int, str]] = []
    in_block = False

    for lineno, line in enumerate(lines, 1):
        stripped = line.strip()
        if not in_block:
            if stripped == "```text":
                in_block = True
            continue
        if stripped == "```":
            break
        block.append((lineno, line))

    return block


def collect_paths(
    block: list[tuple[int, str]],
) -> tuple[list[tuple[int, str]], list[tuple[int, str, list[str]]]]:
    """按相对缩进判据收集基目录与目录项。

    返回 ([(基目录行号, 基目录), ...], [(目录项行号, 条目名, 该层基目录列表), ...])。
    语义续行 / ≝ / s.t. / ↓ / § 等行不满足下述判据，天然跳过。
    """
    bases: list[tuple[int, str]] = []
    items: list[tuple[int, str, list[str]]] = []
    bases_by_decl_indent: dict[int, list[str]] = {}

    for lineno, line in block:
        stripped = line.strip()
        if not stripped:
            continue

        indent = len(line) - len(line.lstrip(" "))

        # 层声明行：运算符后为该层基目录
        if stripped[0] in "=⊂⊃":
            bases_by_decl_indent[indent] = parse_layer_bases(line)
            bases.extend((lineno, base) for base in bases_by_decl_indent[indent])
            continue

        # 目录项行：├── / └── 前缀，归属于缩进恰少 4 的最近层声明
        if stripped.startswith(("├──", "└──")):
            name = parse_item_name(line)
            if name:
                owning_bases = bases_by_decl_indent.get(indent - 4, [])
                items.append((lineno, name, owning_bases))

    return bases, items


def check_bases(bases: list[tuple[int, str]]) -> list[tuple[int, str, str]]:
    problems: list[tuple[int, str, str]] = []
    for lineno, base in bases:
        if not (ROOT / base).is_dir():
            problems.append((lineno, base, "基目录不存在"))
    return problems


def check_items(items: list[tuple[int, str, list[str]]]) -> list[tuple[int, str, str]]:
    """校验每个目录项在候选基目录下唯一命中。"""
    problems: list[tuple[int, str, str]] = []
    for lineno, name, bases in items:
        if not bases:
            problems.append((lineno, name, "未归属于任何层声明，无法解析"))
            continue

        candidates = list(dict.fromkeys([*bases, os.path.commonpath(bases)]))
        hits = [
            base for base in candidates if (ROOT / f"{base}/{name}").exists()
        ]

        if len(hits) == 1:
            continue
        if not hits:
            attempted = "、".join(f"{base}/{name}" for base in candidates)
            problems.append((lineno, name, f"未找到（候选：{attempted}）"))
        else:
            problems.append((lineno, name, f"多义（命中：{'、'.join(hits)}）"))

    return problems


def parse_layer_bases(line: str) -> list[str]:
    """从层声明行提取基目录列表。

    先按 `←` 切注解、再按 ` + ` 切分——顺序不可颠倒，否则条目说明中的 `/` 会被
    误当作路径分隔符（如 default_tool 说明里的"点节点/边"）。
    """
    content = line.strip()[1:].split("←")[0]
    return [part.strip().rstrip("/") for part in content.split(" + ") if part.strip()]


def parse_item_name(line: str) -> str:
    """从目录项行提取条目名（去 ├── / └── 前缀、注解与后续说明）。"""
    rest = line.lstrip(" ")[3:]
    rest = rest.split("←")[0]
    return ITEM_NAME_SPLIT_RE.split(rest, maxsplit=1)[0].strip()


def main() -> int:
    doc_path = DEFAULT_DOC

    args = sys.argv[1:]
    if "--doc" in args:
        idx = args.index("--doc")
        if idx + 1 >= len(args):
            print("[错误] --doc 缺少路径参数")
            return 2
        doc_path = Path(args[idx + 1])

    if not doc_path.exists():
        print(f"[错误] 文档不存在: {doc_path}")
        return 2

    block = extract_text_block(doc_path)
    if not block:
        print(f"[错误] 未找到 ```text 架构树代码块: {doc_path}")
        return 2

    bases, items = collect_paths(block)
    problems = check_bases(bases) + check_items(items)
    checked = len(bases) + len(items)

    print(f"校验完成：{checked} 个路径，{len(problems)} 个失效")
    if problems:
        for lineno, target, reason in problems:
            print(f"  失效 L{lineno}: `{target}` —— {reason}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
