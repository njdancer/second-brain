# Plan: Fork clearlyip Action with Override Support

## Goal
Add PR comment override capability to clearlyip/code-coverage-report-action while keeping all existing functionality.

## Approach

### Option 1: Local Composite Action (Recommended)
Create `.github/actions/coverage-check/` with:
1. Use clearlyip action as-is for parsing & reporting
2. Add a separate step that:
   - Checks action outputs for negative difference
   - Scans PR comments for override pattern
   - Conditionally fails based on override presence

**Pros:**
- ✅ No forking needed
- ✅ Keep upstream updates
- ✅ Simple to implement
- ✅ Clear separation of concerns

**Cons:**
- Requires two steps instead of one

### Option 2: Fork & Modify
Fork the action, add `allow_override_via_comment` input parameter.

**Pros:**
- ✅ Single action
- ✅ Could contribute upstream

**Cons:**
- Need to maintain fork
- Lose upstream updates
- More complex

## Recommended: Option 1 Implementation

```yaml
- name: Report code coverage
  uses: clearlyip/code-coverage-report-action@v5
  id: coverage
  continue-on-error: true  # Don't fail yet
  with:
    filename: 'coverage/clover.xml'
    badge: true
    fail_on_negative_difference: true

- name: Check coverage override
  if: steps.coverage.outcome == 'failure'
  uses: actions/github-script@v7
  with:
    script: |
      // Check for override comment
      const { data: comments } = await github.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
      });

      const overridePattern = /coverage-override:\s*(.+)/i;
      const overrideComment = comments.find(c => overridePattern.test(c.body));

      if (overrideComment) {
        const reason = c.body.match(overridePattern)[1];
        core.warning(`Coverage decrease approved: ${reason}`);
        core.notice('⚠️ Coverage decreased but override approved by maintainer');
      } else {
        core.setFailed('Coverage decreased. Add comment "coverage-override: <reason>" to approve.');
      }

- name: Post coverage comment
  uses: marocchino/sticky-pull-request-comment@v2
  if: always()
  with:
    header: coverage
    path: ${{ steps.coverage.outputs.file }}
```

## Implementation Steps

1. Remove `overall_coverage_fail_threshold` from workflow
2. Add `continue-on-error` to clearlyip step
3. Add override check step
4. Update specs to document override process
5. Test with intentional coverage decrease

## Spec Updates Needed

**specs/testing.md** - Document override process:
```markdown
### Coverage Override Process

If coverage decreases, CI will fail by default. To approve a justified decrease:

1. Add a comment to the PR: `coverage-override: <explanation>`
2. Maintainer reviews and approves the PR
3. CI re-runs and respects the override
4. Coverage report still shows the decrease for visibility
```

**specs/release.md** - Remove absolute 95% requirement:
```markdown
- Code coverage MUST NOT decrease without explicit approval
- Suggested targets: 90%+ statement coverage, 90%+ function coverage
- Current coverage thresholds defined in jest.config.js
```

## Next Steps

Would you like me to:
1. Implement Option 1 (composite approach)?
2. Update the specs accordingly?
3. Test with a coverage decrease scenario?
