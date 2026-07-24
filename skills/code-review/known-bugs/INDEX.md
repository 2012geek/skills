# known-bugs index

The planner agent reads this file to judge which past detection patterns are
semantically relevant to the current PR. Each entry is one line with a relative
link and a one-sentence description.

Relevance is judged semantically (does this PR touch what this bug is about?),
not by keyword match. The planner must justify every relevant / not-relevant
judgment in its `knownBugRelevance` output.

- [assert-vs-raise.md](assert-vs-raise.md) — Python validation-path assert should be ValueError (survives `python -O`)
