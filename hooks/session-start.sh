#!/bin/bash
# Verify GITCODE_TOKEN is available for gitcode-tools skills
if [ -z "$GITCODE_TOKEN" ]; then
  echo "⚠️  GITCODE_TOKEN not set. GitCode skills will not work."
  echo "   Set it with: export GITCODE_TOKEN=<your-token>"
fi
