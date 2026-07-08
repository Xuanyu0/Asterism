---
name: cuimao-translator
description: Translate English markdown documents into natural Chinese with three quality modes. Preserves original meaning sentence-by-sentence while producing fluent Chinese prose.
---

# Markdown Translator (English → Chinese)

Three-mode translation skill for turning English markdown documents into natural, fluent Chinese. The core commitment is **sentence-by-sentence fidelity** — every sentence in the original must exist in the translation, with no meaning added or lost — while reading as if written by a skilled Chinese author.

## Modes

| Mode | Trigger | Steps | Best for |
|------|---------|-------|----------|
| **Quick** 速译 | "快翻", "quick", "速译" | Read → Translate | Quick look, short standalone pieces |
| **Normal** 标准 | default, "翻译", "汉化" | Analyze → Translate | Most documents, chapters, general content |
| **Refined** 精翻 | "精翻", "refined", "精细翻译" | Analyze → Draft → Review → Revise → Polish | Publication-quality output, final delivery |

### Mode upgrade
After Normal mode completes, ask if user wants to proceed with review → revise → polish (same as Refined mode).

## Style Presets

| Style | When to use |
|-------|-------------|
| `literal` 逐句忠实 | Technical docs, when precision is paramount |
| `storytelling` 叙事流畅 | Narratives, essays, non-fiction |
| `elegant` 文采典雅 | Literary works, refined prose |
| `academic` 学术严谨 | Scholarly works, research |
| `conversational` 口语自然 | Informal content, dialogue-heavy |

If no style is specified, detect from content and tone. `storytelling` is a safe default.

## Core Translation Philosophy

### 信 Faithfulness
- Every English sentence must have a corresponding Chinese sentence
- Facts, numbers, logic, and proper names must match exactly
- Never summarize, skip, or embellish

### 达 Fluency
- The Chinese must read naturally, **not like translated text**
- Reorder clauses into natural Chinese topic-comment structure
- Drop unnecessary English connectives (and, but, that, which)
- Break long sentences into natural Chinese breath groups, 7-15 characters each
- **Active voice over passive**: prefer 由/受/让 or restructure
- **Verb complements over adverbs**: "walked slowly" → "走得很慢"

### 雅 Cultural Adaptation
- Find Chinese equivalents for idioms and cultural references
- Add brief inline notes for references unknown to Chinese readers: **（译注：...）**

## Native Chinese Quality Checklist

### Europeanized Chinese — The 6 Red Flags
1. **过度使用"被"字句**: "He was praised" → "他受到了表扬" (not "他被表扬了")
2. **不必要的连接词堆砌**: "因为...所以...", "虽然...但是..." — omit when context is clear
3. **定语堆叠过长**: Break long pre-modifiers into multiple short clauses
4. **"之一"泛滥**: "one of the most..." → "极其..." / "...得很", not always "...之一"
5. **"的"字密度过高**: Three or more 的 in one sentence → restructure
6. **名词化泛滥**: "the implementation of..." → "实施..." (verb form)

### Rhythm & Breath
- Read the Chinese aloud. Does it breathe naturally?
- Alternate sentence lengths. Three long sentences in a row → break one up
- Chinese prose values 留白 — don't over-explain what the original leaves implied

## Output Format

Chinese-only translation. Do NOT include the English original.

Preserve all Markdown structure: headings, lists, code blocks, links, tables, blockquotes.

## Workflow

### Step 0: Choose Mode & Style
Auto-detect from user's phrasing. Normal mode is the default.

### Step 1: Pre-Translation Analysis (Normal & Refined only)
Save analysis to a file. Include:
- Content summary, core arguments
- Terminology extraction (English → Chinese table)
- Tone and style assessment
- Difficult passage alerts

### Step 2: Read & Translate
- **Quick**: Read source → translate directly → write output
- **Normal**: Read chunk → translate paragraph-by-paragraph → append to output
- **Refined**: Full five-step pipeline per section

### Step 3: Chunking Strategy
For long documents, translate section by section. For each chunk:
1. Read the source markdown
2. Translate paragraph by paragraph, applying terminology table and style preset
3. Self-check: Did every sentence get translated? Does the Chinese read naturally?
4. Write/append to output file
5. Report progress

**Terminology consistency**: Review the terminology table before each new chunk.

## Refined Mode: Full Five-Step Pipeline

### Step R1: Analyze (same as Step 1 above)
### Step R2: Draft — Raw translation of the section
### Step R3: Critical Review — Diagnosis only, no rewriting
### Step R4: Revise — Apply all critique findings
### Step R5: Polish — Final pass for publication quality

## Special Content Handling

- **Code blocks**: Keep exactly as-is
- **Links**: Translate link text, keep URL
- **Tables**: Translate cell by cell, preserve structure
- **Blockquotes**: Translate quoted text, preserve citation format
- **Lists**: Translate list items, preserve nesting

## Configuration (EXTEND.md)

Optionally create `.translator/EXTEND.md` in project root:
```yaml
default_mode: normal
style: storytelling
audience: general
glossary:
  "term": "翻译"
```

## Reference Files

- `references/translation-guide.md` — Detailed EN→ZH sentence transformation patterns
- `references/glossary-en-zh.md` — Built-in English→Chinese terminology glossary
- `references/refined-workflow.md` — Extended guidelines for Refined mode pipeline

## Pre-Flight Checklist

- [ ] Every English sentence has a corresponding Chinese sentence
- [ ] Numbers, dates, proper names match the original exactly
- [ ] No sentence reads as obvious "translation-ese" (被/的/之一 abuse)
- [ ] Markdown structure is preserved (headings, code, links, tables)
- [ ] Terminology is consistent (check against glossary)
