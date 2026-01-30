# Claude Code Practical Guide Copy Design

## Project
GitCode Automation Skills - Copy documentation from private to public repo

## Date
2025-01-30

## Overview
Copy "Claude Code 实战案例集" (Claude Code Practical Guide) from private `mylerobot-doc` repo to public `skills` repo, with proper handling of skill links and images.

## Design Decisions

### 1. Source Document
**File:** `/home/chenlening/workspace/mylerobot-doc/学习资料和笔记陈乐宁/总结分享/claude-code使用实战参考.md`

**Content:** Comprehensive guide with:
- 5 real-world case studies
- 13 embedded screenshots (GitHub user-attachments)
- Skill links pointing to private mylerobot-doc repo
- Chinese language documentation

### 2. Image Handling Strategy

**Decision:** Keep remote GitHub URLs

**Rationale:**
- GitHub user-attachments assets remain publicly accessible
- Images are already hosted and loading properly
- No need to duplicate and manage 13 image files locally
- Reduces repo size and maintenance burden

**Verification:** Checked that `user-attachments/assets` URLs work (13 images preserved)

### 3. Link Replacements

| Original Link Pattern | Target Link Pattern |
|----------------------|---------------------|
| `github.com/2012geek/mylerobot-doc/tree/main/skills/gitcode-code-review` | `github.com/2012geek/skills/tree/main/gitcode-code-review` |
| `github.com/2012geek/mylerobot-doc/tree/main/skills/gitcode-pr` | `github.com/2012geek/skills/tree/main/gitcode-pr` |
| `github.com/2012geek/mylerobot-doc/tree/main/skills/gitcode-ci-repair` | `github.com/2012geek/skills/tree/main/gitcode-ci-repair` |

**Images:** No changes - `github.com/user-attachments/assets/*` URLs preserved

### 4. File Location

**Decision:** `/docs/claude-code-practical-guide.md`

**Rationale:**
- Keeps documentation organized in `docs/` folder
- Separates from skill-specific documentation
- Easy to reference from main README

### 5. Content Strategy

**Decision:** Copy with link updates only (no content adaptation)

**Rationale:**
- Document is already well-structured
- Chinese content is appropriate for target audience
- Preserves original formatting and voice
- Only links need updating for public repo

## Implementation

**File:** `/home/chenlening/workspace/2012geek/skills/docs/claude-code-practical-guide.md`

**Steps:**
1. Created `docs/` directory
2. Read source file from private repo
3. Performed string replacements on skill repository URLs
4. Wrote to target location
5. Verified replacements (5 skill links updated, 13 images preserved)
6. Committed with descriptive message

**Commit:** `d8da7209` - docs: add Claude Code practical guide

## Post-Copy Considerations

### Optional Enhancements
1. Add reference to main README navigation
2. Create English translation version
3. Add table of contents for easier navigation

### Maintenance Notes
- Image URLs depend on GitHub's user-attachments service
- If images become inaccessible, consider downloading locally to `docs/assets/`
- Skill links will stay valid as long as repo structure remains consistent

## Success Metrics
- ✅ All skill links updated to public repo
- ✅ All image URLs preserved and functional
- ✅ Document structure maintained
- ✅ File successfully committed to git
