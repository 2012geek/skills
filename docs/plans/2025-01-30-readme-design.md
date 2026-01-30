# README Design Document

## Project
GitCode Automation Skills - Claude Code skills collection

## Date
2025-01-30

## Overview
Create a comprehensive README.md for the skills repository that serves both users and contributors.

## Design Decisions

### 1. Title and Positioning
- **Decision:** "GitCode Automation Skills"
- **Rationale:** Clear, descriptive, immediately conveys the project purpose
- **Audience:** Both users and contributors (per user request)

### 2. Structure
The README follows a progressive information architecture:

1. **Overview Table** - Quick navigation to all skills
2. **Prerequisites** - What users need before starting
3. **Quick Setup** - Minimal steps to get running
4. **Common Workflows** - How skills work together in practice
5. **Configuration** - Detailed setup options
6. **Troubleshooting** - Common issues and solutions
7. **Contributing** - How to contribute

### 3. Skills Included
Per user request, the README focuses on GitCode-related skills only:

| Skill | Status |
|-------|--------|
| gitcode-code-review | ✅ Stable |
| gitcode-code-review-repair | ✅ Stable |
| gitcode-ci-repair | ✅ Stable |
| gitcode-pr | 🚧 Beta |

**Excluded:** ralph-loop, html-presentation, tencent-doc-download

### 4. Content Patterns

#### Configuration Schema
- Shared `config.json` for all skills
- Clear token acquisition instructions
- Skill-specific options table

#### Workflows
- Visual ASCII diagram showing skill relationships
- Concrete bash command examples
- Three common scenarios covering different use cases

#### Troubleshooting
- Problem → Solution format
- Covers authentication, git operations, and API issues

### 5. Contact Information
Per user request - **generic only**, no personal contact details included.

## Implementation

**File:** `/home/chenlening/workspace/2012geek/skills/README.md`

The README is modular:
- Main README provides navigation and quick start
- Each skill has its own detailed README in its directory
- Users can drill down based on their needs

## Future Considerations

1. **Versioning:** Consider adding version badges when skills stabilize
2. **Examples:** Add a real-world example section with actual PR links
3. **Architecture:** Consider adding a high-level architecture diagram
4. **Changelog:** Consider a root-level CHANGELOG.md for cross-skill changes
