# How to run these presets


**Order:**
- Batch 0 → Batch 1 → Batch 2 (parallel items) → Batch 3 (five small PRs in parallel) → Batch 4 → Batch 5 → Batch 6 → Batch 7


**Global policies:**
- No schema drift without a separate `schema-change` PR.
- Tests required (pytest; Storybook/Playwright for UI).
- CI uses mocks; no live keys.
- Dates in UI = **MM/DD/YYYY**.
- PR template `planning/presets/pr-template.md` must be used.

---


## pr-template.md
```md
# Summary
<one paragraph>


# What changed
- Files:
- <path>: <brief>


# Tests
- Pytest: <results>
- Playwright/Storybook: <results>


# Contracts & Schemas
- Confirmed **no schema edits** to frozen contracts.


# How to verify locally
```bash
uv run pytest -q
pnpm build && pnpm test:e2e