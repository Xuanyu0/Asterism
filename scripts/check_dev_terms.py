#!/usr/bin/env python3
"""
开发术语表标识符存活校验脚本。

校验 docs/开发文档/开发术语表.md 中「## 术语表」之后表格的代码标识符列：
每个反引号内的标识符必须能在代码库中检索到。

校验规则依据（见开发术语表「编写规则」）：
- 规则 6：每个标识符用独立反引号包裹，脚本按反引号提取标识符。
- 规则 7：反引号内必须是代码中独立可完整 grep 的代码片段。

标识符分类与校验方式：
- 目录路径（以 / 结尾）       → 检查目录存在
- 文件路径（含 / 或纯文件名）→ 检查文件存在
- 符号 / 字面量 / 代码片段   → 在代码库所有源文件中做固定字符串匹配

用法：
    python3 scripts/check_dev_terms.py [--table PATH]

退出码：0 = 全部存活；1 = 存在缺失标识符。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TABLE = ROOT / "docs" / "开发文档" / "开发术语表.md"
CODE_ROOTS = [
    ROOT / "frontend" / "src",
    ROOT / "packages" / "graph-engine" / "src",
]
CODE_EXTENSIONS = {".ts", ".vue", ".js"}

TOKEN_RE = re.compile(r"`([^`]+)`")


def parse_table_rows(table_path: Path) -> list[tuple[int, str, list[str]]]:
    """解析「## 术语表」之后的表格行。

    返回 [(行号, 中文翻译, 标识符列 token 列表), ...]。
    只取代码标识符列（第二列）；跳过表头、分隔行与规则区。
    """
    rows: list[tuple[int, str, list[str]]] = []
    in_table = False
    lines = table_path.read_text(encoding="utf-8").splitlines()

    for lineno, line in enumerate(lines, 1):
        stripped = line.strip()

        # 标题：进入 / 退出「## 术语表」区域
        if stripped.startswith("## "):
            in_table = stripped == "## 术语表"
            continue

        if not in_table or not stripped.startswith("|"):
            continue

        # 跳过表头（含"代码标识符"字样）与分隔行（仅由 | - 空格组成）
        if "代码标识符" in stripped:
            continue
        if set(stripped.replace("|", "").replace("-", "").strip()) <= set():
            continue

        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if len(cells) < 2:
            continue

        tokens = TOKEN_RE.findall(cells[1])
        if tokens:
            rows.append((lineno, cells[0], tokens))

    return rows


def collect_code_files() -> list[Path]:
    """收集代码库中所有目标源文件。"""
    files: list[Path] = []
    for root in CODE_ROOTS:
        if root.exists():
            files.extend(p for p in root.rglob("*") if p.suffix in CODE_EXTENSIONS)
    return files


def is_path_token(token: str) -> bool:
    """是否目录 / 文件路径形态的 token。"""
    return token.endswith("/") or token.endswith((".ts", ".vue", ".js"))


def check_file_path(token: str, code_files: list[Path]) -> bool:
    """目录 / 文件路径存在性校验。"""
    if token.endswith("/"):
        # 目录：相对任一代码根
        return any(
            (root / token.rstrip("/")).is_dir()
            for root in CODE_ROOTS
            if root.exists()
        )

    if "/" in token:
        # 相对路径文件：相对任一代码根
        return any(
            (root / token).is_file() for root in CODE_ROOTS if root.exists()
        )

    # 纯文件名：按 basename 匹配
    return any(p.name == token for p in code_files)


def check_symbol(token: str, code_files: list[Path]) -> bool:
    """符号 / 字面量 / 代码片段：固定字符串匹配（非正则）。"""
    needle = token.encode("utf-8")
    for f in code_files:
        try:
            if needle in f.read_bytes():
                return True
        except OSError:
            continue
    return False


def main() -> int:
    table_path = DEFAULT_TABLE

    args = sys.argv[1:]
    if "--table" in args:
        idx = args.index("--table")
        if idx + 1 >= len(args):
            print("[错误] --table 缺少路径参数")
            return 2
        table_path = Path(args[idx + 1])

    if not table_path.exists():
        print(f"[错误] 术语表不存在: {table_path}")
        return 2

    code_files = collect_code_files()
    rows = parse_table_rows(table_path)

    missing: list[tuple[int, str, str]] = []
    checked = 0

    for lineno, term, tokens in rows:
        for token in tokens:
            checked += 1
            if is_path_token(token):
                ok = check_file_path(token, code_files)
            else:
                ok = check_symbol(token, code_files)
            if not ok:
                missing.append((lineno, term, token))

    print(f"校验完成：{checked} 个标识符，{len(missing)} 个缺失")
    if missing:
        for lineno, term, token in missing:
            print(f"  缺失 L{lineno}「{term}」: `{token}`")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
