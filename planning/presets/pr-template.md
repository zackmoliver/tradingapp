# Pull Request Template - Options Trading Backtest Engine

## 📋 PR Summary

**Batch:** <!-- e.g., Batch 1 - Contracts Freeze, Batch 2 - Engine + Signals -->
**Type:** <!-- Feature, Bugfix, Refactor, Documentation, Testing -->
**Priority:** <!-- High, Medium, Low -->

### What Changed
<!-- Provide a clear, concise description of what this PR accomplishes -->

### Why This Change
<!-- Explain the motivation, business requirement, or problem this solves -->

---

## 🎯 Batch Information

**Batch Title:** <!-- Copy from batch JSON file -->
**Batch Instructions Addressed:**
<!-- List the specific instructions from the batch that this PR fulfills -->
- [ ] Instruction 1: <!-- e.g., "Add Dockerfile and .devcontainer/devcontainer.json" -->
- [ ] Instruction 2: <!-- e.g., "Emit/finalize interfaces and schemas only" -->
- [ ] Instruction N: <!-- Continue as needed -->

**Related Issues:** <!-- Link any GitHub issues this PR addresses -->
- Closes #<!-- issue number -->
- Relates to #<!-- issue number -->

---

## 🔧 Technical Changes

### Files Added
<!-- List new files created -->
- `path/to/new/file.py` - Brief description of purpose
- `path/to/another/file.ts` - Brief description of purpose

### Files Modified
<!-- List existing files that were changed -->
- `path/to/modified/file.py` - Description of changes made
- `path/to/another/modified.ts` - Description of changes made

### Files Deleted
<!-- List any files that were removed -->
- `path/to/deleted/file.py` - Reason for deletion

### Dependencies Added/Updated
<!-- List any new or updated dependencies -->
- Added: `package-name@version` - Purpose/reason
- Updated: `package-name` from `old-version` to `new-version` - Reason

---

## 🧪 Testing

### Test Strategy
<!-- Describe how this change was tested -->
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed
- [ ] End-to-end testing completed
- [ ] Performance testing conducted

### Test Coverage
<!-- Provide test coverage information -->
- **New Code Coverage:** <!-- e.g., 95% -->
- **Overall Coverage Change:** <!-- e.g., +2.3% -->

### Test Commands
<!-- Provide commands to run the tests -->
```bash
# Python tests
uv run pytest -q

# TypeScript/Node tests
pnpm test

# Linting and type checking
pnpm lint
pnpm type-check

# Full CI pipeline locally
pnpm ci:local
```

### Manual Testing Steps
<!-- Provide step-by-step manual testing instructions -->
1. Step 1: <!-- e.g., "Start the development environment" -->
2. Step 2: <!-- e.g., "Navigate to the PayoffChart component" -->
3. Step 3: <!-- e.g., "Verify the chart renders correctly" -->
4. Expected Result: <!-- What should happen -->

---

## ✅ Acceptance Criteria Verification

### Batch Acceptance Criteria
<!-- Copy the acceptance criteria from the batch JSON and check off completed items -->
- [ ] <!-- e.g., "Containers build; repo boots in devcontainer" -->
- [ ] <!-- e.g., "CI green with stubs and mocks" -->
- [ ] <!-- e.g., "Local: `uv run pytest -q` and `pnpm build` both succeed" -->

### Code Quality Checklist
- [ ] **Type Safety:** MyPy/PyRight clean, TypeScript compiles without errors
- [ ] **Linting:** Ruff/Black (Python), ESLint/Prettier (TypeScript) pass
- [ ] **Testing:** All tests pass, coverage maintained/improved
- [ ] **Documentation:** Code is well-documented, README updated if needed
- [ ] **Performance:** No performance regressions introduced
- [ ] **Security:** No security vulnerabilities introduced

### Architecture Compliance
- [ ] **Interfaces Only:** No business logic in interface/contract files (Batch 1)
- [ ] **Type Contracts:** All interfaces properly typed and documented
- [ ] **Date Format:** MM/DD/YYYY format enforced where specified
- [ ] **Immutability:** Data structures use readonly/frozen patterns
- [ ] **Error Handling:** Proper exception types and error handling

---

## 📊 Impact Assessment

### Breaking Changes
<!-- List any breaking changes -->
- [ ] No breaking changes
- [ ] Breaking changes (list below):
  - Change 1: Description and migration path
  - Change 2: Description and migration path

### Performance Impact
<!-- Describe any performance implications -->
- [ ] No performance impact
- [ ] Performance improvement: <!-- Describe improvement -->
- [ ] Performance regression: <!-- Describe and justify -->

### Security Impact
<!-- Describe any security implications -->
- [ ] No security impact
- [ ] Security improvement: <!-- Describe improvement -->
- [ ] Security consideration: <!-- Describe and mitigation -->

---

## 🔍 Review Guidelines

### Focus Areas for Reviewers
<!-- Highlight specific areas that need careful review -->
- [ ] **Interface Design:** Review contract definitions and type safety
- [ ] **Architecture Compliance:** Ensure adherence to established patterns
- [ ] **Test Coverage:** Verify comprehensive testing of new functionality
- [ ] **Documentation:** Check that interfaces are well-documented
- [ ] **Performance:** Review for potential performance issues

### Specific Review Questions
<!-- Ask specific questions for reviewers to consider -->
1. Do the interfaces provide sufficient abstraction without over-engineering?
2. Are the type definitions comprehensive and future-proof?
3. Does the implementation follow the established architecture patterns?
4. Are there any edge cases not covered by the current design?

---

## 📚 Documentation

### Documentation Updated
- [ ] **README.md** - Updated with new features/changes
- [ ] **API Documentation** - Interface documentation updated
- [ ] **Architecture Docs** - Updated planning/architecture.md if needed
- [ ] **Schema Documentation** - Updated schema definitions
- [ ] **Deployment Docs** - Updated deployment instructions if needed

### Examples Added
- [ ] **Code Examples** - Added usage examples for new interfaces
- [ ] **Test Examples** - Added example test cases
- [ ] **Configuration Examples** - Added configuration examples

---

## 🚀 Deployment

### Deployment Checklist
- [ ] **Environment Variables** - No new environment variables required
- [ ] **Database Changes** - No database migrations required
- [ ] **Configuration Changes** - No configuration changes required
- [ ] **Dependencies** - All dependencies properly declared

### Rollback Plan
<!-- Describe how to rollback this change if needed -->
- Rollback steps: <!-- e.g., "Revert commit, restart services" -->
- Risk assessment: <!-- Low/Medium/High -->
- Monitoring: <!-- What to monitor after deployment -->

---

## 📝 Additional Notes

### Known Issues
<!-- List any known issues or limitations -->
- Issue 1: Description and planned resolution
- Issue 2: Description and planned resolution

### Future Work
<!-- List any follow-up work or improvements planned -->
- [ ] Future enhancement 1
- [ ] Future enhancement 2
- [ ] Technical debt item to address

### References
<!-- Link to relevant documentation, discussions, or external resources -->
- [Architecture Document](../architecture.md)
- [Batch Specification](../../batch1.architect.contracts.json)
- [Related Discussion](#) <!-- Link to GitHub discussion or issue -->

---

## 🏷️ Labels

<!-- Suggest labels for this PR -->
**Suggested Labels:**
- `batch-1` / `batch-2` / etc.
- `feature` / `bugfix` / `refactor` / `docs`
- `backend` / `frontend` / `infrastructure`
- `breaking-change` (if applicable)
- `needs-review` / `ready-to-merge`

---

**Reviewer Assignment:**
- [ ] **Architecture Review:** @<!-- architecture reviewer -->
- [ ] **Code Review:** @<!-- code reviewer -->
- [ ] **Testing Review:** @<!-- testing reviewer -->
- [ ] **Security Review:** @<!-- security reviewer --> (if applicable)

**Merge Requirements:**
- [ ] All CI checks pass
- [ ] At least 2 approving reviews
- [ ] All conversations resolved
- [ ] Acceptance criteria verified
