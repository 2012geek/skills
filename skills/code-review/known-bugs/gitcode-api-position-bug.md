---
name: gitcode-api-position-bug
description: GitCode inline comment position uses new-file line numbers, not diff-relative positions
relevantTo: [gitcode, api, comments]
lastSeen: 2026-07-23
---

# GitCode inline comment position semantics

## Symptom
Posting an inline DiffNote with a position computed as "diff-relative line offset" (like GitHub) results in the comment landing on the wrong line or being rejected by the GitCode API.

## Root cause
GitCode's `position` field for inline comments uses the **new-file line number** (1-based, in the after-state of the file), not a diff-relative offset. This differs from GitHub's semantics. The `calculatePosition` helper in older versions of the reviewer script had a bug here.

## Detection pattern
1. If the PR diff touches `gitcode-reviewer.js` or any file that posts inline comments → check
2. Look for `position` field construction logic
3. If it uses `line - diffHeaderLine` or similar offset math → flag
4. Correct: `position = lineNumberInNewFile` (the file's after-state line number)

## Fix pattern
```javascript
// wrong (GitHub-style)
const position = diffLineIndex - hunkHeaderLine;

// right (GitCode)
const position = newFileLineNumber;
```

## Historical cases
- vla-factory GitCode PR reviews: inline comments on wrong line until position field was corrected.

## Trigger keywords
- PR touches `gitcode-reviewer.js`, `comment-formatter.js`, or `gitcode-api.js`
- PR description mentions "GitCode API", "inline comment", "DiffNote", "position"
