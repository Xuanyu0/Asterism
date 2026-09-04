#!/usr/bin/env python3
"""
术语表时间戳更新脚本。

为 CLAUDE.md「时间戳」小节的三行更新各术语表文件的最后修改日期：
读取术语表文件的 mtime（最后写入时间），写入对应行末尾，格式 `Last updated: YYYY-MM-DD`。

用途：为 AGENT 提供术语表的时效性信息——读到 CLAUDE.md 即可判断
各术语表文件最后更新于何时，无需逐个检查文件。

用法（pre-commit 钩子调用）：
    python3 scripts/update_term_dates.py

行为：
- 硬编码术语表名称→路径映射，校验路径存在
- 无条件按各术语表文件的 mtime 更新三行日期（幂等：日期未变则无 diff）
- 修改 CLAUDE.md 后自动 git add（**仅当 CLAUDE.md 无其他未暂存改动时**），使时间戳改动进入本次 commit；若存在非时间戳的未暂存改动，跳过 add 并提示（避免卷入用户无关改动）
- 退出码：0 = 成功；1 = 解析/执行错误
"""

from __future__ import annotations

import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLAUDE_PATH = ROOT / "CLAUDE.md"

# 术语表名称 → 文件路径（相对仓库根）
GLOSSARIES = {
    "设计术语表": "docs/设计/设计术语表.md",
    "开发术语表": "docs/开发文档/开发术语表.md",
    "项目术语表": "项目术语表.md",
}

STAMP_RE = re.compile(r"`Last updated: \d{4}-\d{2}-\d{2}`")


def read_claude_section(claude_text: str, heading: str) -> str:
    """提取指定四级标题到下一个四级标题之间的文本（含行尾空行）。"""
    lines = claude_text.splitlines()
    start: int | None = None
    for i, line in enumerate(lines):
        if line.strip() == f"#### {heading}":
            start = i
            break
    if start is None:
        return ""

    end = len(lines)
    for i in range(start + 1, len(lines)):
        if lines[i].strip().startswith("#### "):
            end = i
            break

    return "\n".join(lines[start + 1 : end]) + "\n"


def update_stamp_in_line(line: str, stamp: str) -> str:
    """行末更新/追加反引号包裹的时间戳。"""
    if STAMP_RE.search(line):
        return STAMP_RE.sub(f"`Last updated: {stamp}`", line, count=1)
    return f"{line}`Last updated: {stamp}`"


def main() -> int:
    if not CLAUDE_PATH.exists():
        print("[错误] CLAUDE.md 不存在")
        return 1

    claude_text = CLAUDE_PATH.read_text(encoding="utf-8")
    section = read_claude_section(claude_text, "时间戳")
    if not section:
        print("[错误] CLAUDE.md 中未找到「时间戳」小节")
        return 1

    # 逐行匹配占位行（**名称**：），按硬编码映射更新日期
    lines = section.split("\n")
    for i, line in enumerate(lines):
        m = re.match(r"\*\*([^*]+)\*\*：", line)
        if not m or m.group(1) not in GLOSSARIES:
            continue

        rel_path = GLOSSARIES[m.group(1)]
        path = ROOT / rel_path
        if not path.exists():
            print(f"[错误] 术语表文件不存在: {rel_path}")
            return 1

        stamp = date.fromtimestamp(path.stat().st_mtime).isoformat()
        lines[i] = update_stamp_in_line(line, stamp)

    # 回写小节（用 split("\n") 保留行尾空行），再替换回全文
    new_section = "\n".join(lines)
    claude_text = claude_text.replace(section, new_section, 1)
    CLAUDE_PATH.write_text(claude_text, encoding="utf-8")

    # 重新暂存 CLAUDE.md：仅当 diff 只含时间戳行改动时 add。
    # git add 是文件级操作——若用户有未暂存的非时间戳改动，add 会一并卷入本次 commit。
    diff = subprocess.run(
        ["git", "diff", "--", "CLAUDE.md"], cwd=ROOT, capture_output=True, text=True
    ).stdout.splitlines()
    changed_lines = [
        line
        for line in diff
        if (line.startswith("+") or line.startswith("-"))
        and not line.startswith("+++")
        and not line.startswith("---")
    ]
    non_stamp_changes = [line for line in changed_lines if "Last updated: " not in line]
    if non_stamp_changes:
        print("⚠ CLAUDE.md 存在非时间戳的未暂存改动，本次不自动暂存术语表时间戳")
    else:
        subprocess.run(["git", "add", "CLAUDE.md"], cwd=ROOT, check=True)

    print("术语表时间戳已更新")
    return 0


if __name__ == "__main__":
    sys.exit(main())
