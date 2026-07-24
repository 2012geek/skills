---
name: en-cn-drift
description: .md and .cn.md file pairs describe different structures after partial updates
relevantTo: [docs, i18n, parity]
lastSeen: 2026-07-23
---

# EN/中文 documentation drift

## Symptom
A project maintains both `docs/foo.md` (English) and `docs/foo.cn.md` (Chinese). A PR updates one but not the other, or updates both with different content, leaving the two describing different module structures.

## Root cause
- No automated check enforces EN/中文 parity
- Developers fluent in one language update that side only
- Translation drift over time

## Detection pattern
1. If the PR diff touches both `.md` and `.cn.md` of the same stem → compare structural elements:
   - Module/file paths listed
   - Class names mentioned
   - CLI options documented
   - Number of items in lists
2. If the PR touches only `.md` (not `.cn.md`) → check the `.cn.md` (if it exists in the repo) for the same structural elements; flag drift
3. Use the `en-cn-parity-checker` agent template

## Fix pattern
Update the stale side to match. If the PR intentionally only updates one side (e.g. CN-only tutorial), document it in the PR description.

## Historical cases
- PR #7 vla-factory: `architecture.cn.md §5.4` still listed deleted `Transport` class after EN version was rewritten.

## Trigger keywords
- diff touches both `<file>.md` and `<file>.cn.md`
- diff touches only `.md` when `.cn.md` exists
- PR description mentions "translation", "i18n", "中文", "parity"
