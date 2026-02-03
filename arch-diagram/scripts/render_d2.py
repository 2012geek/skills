#!/usr/bin/env python3
"""
Render D2 diagram to SVG using D2 CLI.

Usage:
    python render_d2.py <input.d2> [--output <output.svg>]

This script wraps the D2 CLI for SVG rendering.
"""

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Optional


def check_d2_installed() -> bool:
    """Check if D2 CLI is installed."""
    try:
        result = subprocess.run(
            ['d2', '--version'],
            capture_output=True,
            timeout=5
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def generate_svg_name(input_path: Path) -> str:
    """Generate SVG filename from input path."""
    base_name = input_path.stem

    # Clean up common suffixes
    for suffix in ['-analysis', '-arch', 'architecture', 'diagram']:
        base_name = base_name.replace(suffix, '')

    return f"{base_name}-architecture.svg"


def render_d2_to_svg(
    d2_file: Path,
    output_path: Path,
    timeout: int = 30
) -> bool:
    """
    Render D2 file to SVG using D2 CLI.

    Returns True if successful, False otherwise.
    """
    cmd = [
        'd2',
        str(d2_file),
        str(output_path),
        '--layout',
        'elk'
    ]

    print(f"Running: {' '.join(cmd)}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False
        )

        if result.returncode == 0:
            print(f"✓ SVG generated: {output_path}")
            return True
        else:
            print(f"Error: D2 CLI failed", file=sys.stderr)
            print(f"stdout: {result.stdout}", file=sys.stderr)
            print(f"stderr: {result.stderr}", file=sys.stderr)
            return False

    except subprocess.TimeoutExpired:
        print(f"Error: D2 rendering timed out after {timeout}s", file=sys.stderr)
        return False
    except FileNotFoundError:
        print("Error: D2 CLI not found", file=sys.stderr)
        print("\nTo install D2:", file=sys.stderr)
        print("  macOS:   brew install d2", file=sys.stderr)
        print("  Linux:   See https://d2lang.com/tour/install/", file=sys.stderr)
        print("  Windows: See https://d2lang.com/tour/install/", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Render D2 diagram to SVG using D2 CLI"
    )
    parser.add_argument("input", help="Input D2 file")
    parser.add_argument("--output", "-o", help="Output SVG file")
    parser.add_argument(
        "--timeout",
        type=int,
        default=30,
        help="Timeout in seconds (default: 30)"
    )

    args = parser.parse_args()

    # Check D2 installation
    if not check_d2_installed():
        print("Error: D2 CLI is not installed.", file=sys.stderr)
        print("\nInstallation instructions:", file=sys.stderr)
        print("  macOS:   brew install d2", file=sys.stderr)
        print("  Linux:   wget https://github.com/terrastruct/d2/releases/download/vX.X.X/d2-linux-amd64", file=sys.stderr)
        print("  Windows: https://d2lang.com/tour/install/", file=sys.stderr)
        print("\nOr visit: https://d2lang.com/", file=sys.stderr)
        return 1

    # Validate input file
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file '{args.input}' does not exist", file=sys.stderr)
        return 1

    # Determine output path
    if args.output:
        output_path = Path(args.output)
    else:
        svg_name = generate_svg_name(input_path)
        # Output in same directory as input
        output_path = input_path.parent / svg_name

    # Render D2 to SVG
    success = render_d2_to_svg(
        input_path,
        output_path,
        timeout=args.timeout
    )

    if success:
        return 0
    else:
        return 1


if __name__ == "__main__":
    sys.exit(main())
