#!/usr/bin/env python3
"""
Analyze a codebase and generate architecture markdown for Structurizr DSL conversion.

Usage:
    python analyze_codebase.py <path> [--output <file>] [--llm-api-key <key>]

The script:
1. Scans the directory/file for code structure
2. Uses LLM to analyze architecture patterns
3. Outputs architecture.md as intermediate format
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional
import subprocess

# Default output file
DEFAULT_OUTPUT = "architecture.tmp.md"


def detect_project_type(path: Path) -> str:
    """Detect project type based on files present."""
    indicators = {
        "python": ["requirements.txt", "setup.py", "pyproject.toml", "Pipfile"],
        "javascript": ["package.json", "yarn.lock", "pnpm-lock.yaml"],
        "java": ["pom.xml", "build.gradle", "build.gradle.kts"],
        "go": ["go.mod", "go.sum"],
        "rust": ["Cargo.toml", "Cargo.lock"],
        "ruby": ["Gemfile"],
        "php": ["composer.json"],
    }

    for lang, files in indicators.items():
        if any((path / f).exists() for f in files):
            return lang
    return "unknown"


def scan_directory(path: Path, max_depth: int = 5) -> List[Dict]:
    """Scan directory structure for relevant files."""
    structure = []

    for item in sorted(path.rglob("*")):
        # Skip hidden files and common ignore patterns
        if any(part.startswith('.') for part in item.parts):
            continue
        if any(part in item.parts for part in ['node_modules', '__pycache__', 'target', 'venv', '.git']):
            continue

        if item.is_file():
            rel_path = item.relative_to(path)
            depth = len(rel_path.parts)

            if depth <= max_depth:
                structure.append({
                    "path": str(rel_path),
                    "name": item.name,
                    "extension": item.suffix,
                    "size": item.stat().st_size,
                })

    return structure


def extract_imports(file_path: Path, project_type: str) -> List[str]:
    """Extract imports/dependencies from a file."""
    imports = []

    try:
        content = file_path.read_text(encoding='utf-8', errors='ignore')

        if project_type == "python":
            for line in content.split('\n'):
                line = line.strip()
                if line.startswith(('import ', 'from ')):
                    imports.append(line)
        elif project_type == "javascript":
            for line in content.split('\n'):
                line = line.strip()
                if line.startswith(('import ', 'require(')):
                    imports.append(line)

    except Exception:
        pass

    return imports


def call_llm_analysis(structure: List[Dict], project_type: str, path: str, api_key: Optional[str] = None) -> str:
    """
    Call LLM to analyze code structure and generate architecture description.

    This function provides the analysis prompt. The actual LLM call should be
    made by Claude or the appropriate LLM interface.
    """

    prompt = f"""Analyze this {project_type} codebase at: {path}

Files found ({len(structure)}):
{json.dumps(structure[:50], indent=2)}

Generate an architecture analysis in the following markdown format:

```markdown
# Architecture Analysis: [Project Name]

## Project Overview
[Brief description of what this project does]

## Architecture Pattern
[Identify: Monolithic, Microservices, Layered, Hexagonal, etc.]

## Components

### Software Systems
- **[Name]**: [Description]

### Containers
- **[Name]**: [Description] (Technology: [tech])

### Key Components
- **[Name]**: [Description] (Technology: [tech])

## Relationships
- [Source] -> [Destination]: [Description] (Technology: [tech])

## Data Flow
[Describe main data flows]

## External Dependencies
[List external services/integrations]
```

Return ONLY the markdown content, nothing else."""

    return prompt


def generate_with_clude(prompt: str, api_key: Optional[str] = None) -> str:
    """
    Generate architecture analysis using Claude/LLM.

    Note: This is a placeholder. The actual implementation should use
    the appropriate LLM API (Anthropic, OpenAI, etc.) or be called
    through Claude Code's interface.
    """
    # For now, save the prompt and let Claude process it
    return f"""<!-- LLM Analysis Prompt -->
{prompt}

<!-- Note: Run this through your LLM to get the actual analysis -->
"""


def main():
    parser = argparse.ArgumentParser(description="Analyze codebase for architecture diagram generation")
    parser.add_argument("path", help="Path to directory or file to analyze")
    parser.add_argument("--output", "-o", default=DEFAULT_OUTPUT, help="Output markdown file")
    parser.add_argument("--llm-api-key", help="LLM API key (optional)")
    parser.add_argument("--max-depth", type=int, default=5, help="Maximum scan depth")

    args = parser.parse_args()

    path = Path(args.path).resolve()
    if not path.exists():
        print(f"Error: Path '{args.path}' does not exist", file=sys.stderr)
        return 1

    # Detect project type
    project_type = detect_project_type(path if path.is_dir() else path.parent)
    print(f"Detected project type: {project_type}")

    # Scan structure
    if path.is_dir():
        structure = scan_directory(path, args.max_depth)
    else:
        structure = [{
            "path": path.name,
            "name": path.name,
            "extension": path.suffix,
            "size": path.stat().st_size,
        }]

    print(f"Found {len(structure)} files")

    # Generate analysis prompt
    prompt = call_llm_analysis(structure, project_type, str(path), args.llm_api_key)

    # For now, save the prompt. The LLM will be called separately.
    output = Path(args.output)
    output.write_text(prompt, encoding='utf-8')

    print(f"Analysis prompt saved to: {output}")
    print("\nNote: Please process the prompt through your LLM to get the actual architecture analysis.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
