#!/bin/bash
# 最简版 — 从总纲读步骤，交叉验证 git + 文件时间 + impl-spec
set -uo pipefail

D="docs/开发文档/P2开发文档/phase2b"
NOW=$(date +%s)

# 提取总纲步骤数据行
start=$(grep -n '^## 开发步骤' "$D/00-总纲.md" | cut -d: -f1)
start=$((start + 4))
rows=$(sed -n "${start},\$p" "$D/00-总纲.md" | while IFS= read -r l; do
    case "$l" in "| "[0-9]*) echo "$l" ;; ""|"#"*) break ;; esac
done)

# 输出: 用 | 分隔各列，最后 column -t 按显示宽度自动对齐
output=""
while IFS= read -r row; do
    num=$(echo "$row" | cut -d'|' -f2 | tr -d ' ')
    # 总纲链接格式: [文字](文件名.md) → 从 () 提取
    file=$(echo "$row" | cut -d'|' -f3 | sed 's/.*(//;s/).*//')
    file_disp="${file%.md}"  # 去 .md 后缀显示
    st=$(echo "$row" | cut -d'|' -f5 | tr -d ' ')
    [ -z "$st" ] && st="-"

    sf="$D/步骤/$file"
    [ ! -f "$sf" ] && continue

    mt=$(stat -c %Y "$sf" 2>/dev/null || echo "$NOW")
    days=$(( (NOW - mt) / 86400 ))
    case $days in 0) ds="今天" ;; 1) ds="1天前" ;; *) ds="${days}天前" ;; esac

    id=$(find "$D/提示词/" -maxdepth 1 -type d -name "${num}-*" 2>/dev/null | head -1)
    ic=0; [ -n "$id" ] && ic=$(find "$id" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l)

    df_disc="$D/发现/$file"
    pc=0; [ -f "$df_disc" ] && pc=$(grep -c '状态：⏳' "$df_disc" 2>/dev/null) || pc=0

    sig=""
    [ "$ic" -gt 0 ] && sig="📄"
    [ "$pc" -gt 0 ] && sig="${sig}⚠${pc}"
    [ "$st" = "🔨" ] && [ "$days" -gt 2 ] && sig="${sig}💀"
    [ "$days" -le 2 ] && [ "$ic" -gt 0 ] && sig="${sig}🔥"

    output+="${num}|${file_disp}|${st}|${ds}|${sig}"$'\n'
done <<< "$rows"

echo "编号  文件                状态  距今    信号"
echo "────  ──────────────────  ────  ──────  ────────"
echo -n "$output" | column -t -s '|' -o '  '

# 总纲未列的活跃步骤
extra_output=""
for sf in "$D"/步骤/*.md; do
    [ ! -f "$sf" ] && continue
    nm=$(basename "$sf" .md)
    echo "$rows" | grep -qF "$nm" && continue

    mt=$(stat -c %Y "$sf" 2>/dev/null || echo "$NOW")
    days_x=$(( (NOW - mt) / 86400 ))
    [ "$days_x" -gt 2 ] && continue

    nu=$(echo "$nm" | grep -oP '^\d+')
    id=$(find "$D/提示词/" -maxdepth 1 -type d -name "${nu}-*" 2>/dev/null | head -1)
    ic=0; [ -n "$id" ] && ic=$(find "$id" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l)
    df_disc="$D/发现/${nm}.md"
    pc=0; [ -f "$df_disc" ] && pc=$(grep -c '状态：⏳' "$df_disc" 2>/dev/null) || pc=0

    sig=""; [ "$ic" -gt 0 ] && sig="📄"; [ "$pc" -gt 0 ] && sig="${sig}⚠${pc}🔥"
    extra_output+="${nu}|${nm}|?|今天|${sig}"$'\n'
done
if [ -n "$extra_output" ]; then
    echo ""
    echo -n "$extra_output" | column -t -s '|' -o '  '
fi

echo ""
echo "🔥=活跃 📄=有提示词 ⚠N=N项待确认 💀=脏(🔨但超2日未改)"
