---
name: assert-vs-raise
description: Python validation-path assert should be ValueError (survives python -O)
relevantTo: [python, validation, error-handling]
lastSeen: 2026-07-23
---

# assert → ValueError migration

## Symptom
PR writes validation as `assert x > 0`, stripped under `python -O`. Validation
fails silently in production.

## Root cause
- `assert` statements are removed when Python runs with `-O` (optimized mode).
- Validation paths (parameter checks, contract checks, invariants) must not
  use `assert`.
- Use `if not x: raise ValueError(...)` instead.

## Detection pattern
1. grep diff for the `assert ` keyword (note: `assert` followed by space, not
   substring match, to avoid `assertion`/`assertEqual`).
2. Check whether the assert is on a validation path:
   - Inside `__post_init__`, `__init__`, parameter-check functions → validation
   - Inside test files (`test_*.py`, `*_test.py`) → test assertion, skip
   - At the top of a public method, checking parameters → validation
3. If on a validation path → report. Otherwise → skip.

## Fix pattern
```python
# wrong
assert action_dim == self.action_dim, "dim mismatch"

# right
if action_dim != self.action_dim:
    raise ValueError(f"Expected action_dim={self.action_dim}, got {action_dim}")
```

## Historical cases
- PR #7 vla-factory: `LerobotHostActionAdapter` and `LerobotHostObsAdapter` migrated `assert` → `ValueError` (fixed).

## Trigger keywords
- `assert ` in non-test Python files
- PR description mentions "assert", "validation", "校验"
- `__post_init__`, `__init__`, parameter-check functions
