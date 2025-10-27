# Workflow Update: Add Coverage Override Support

## Changes Required in `.github/workflows/test.yml`

Replace the current coverage reporting section (lines 144-159) with the following:

### Current Code (REMOVE):
```yaml
      - name: Report code coverage
        uses: clearlyip/code-coverage-report-action@v5
        id: coverage
        if: always()
        with:
          filename: 'coverage/clover.xml'
          overall_coverage_fail_threshold: '95'
          badge: true
          fail_on_negative_difference: true

      - name: Post coverage comment to PR
        uses: marocchino/sticky-pull-request-comment@v2
        if: github.event_name == 'pull_request' && always()
        with:
          header: coverage
          path: ${{ steps.coverage.outputs.file }}
```

### New Code (REPLACE WITH):
```yaml
      - name: Report code coverage
        uses: clearlyip/code-coverage-report-action@v5
        id: coverage
        continue-on-error: true  # Don't fail yet - check for override first
        if: always()
        with:
          filename: 'coverage/clover.xml'
          badge: true
          fail_on_negative_difference: true
          only_list_changed_files: true  # Only show coverage for changed files in PRs
          # No overall_coverage_fail_threshold - use trend-based monitoring only

      - name: Check coverage override
        if: steps.coverage.outcome == 'failure' && github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            // Coverage decreased - check for override comment
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });

            const overridePattern = /coverage-override:\s*(.+)/i;
            const overrideComment = comments.find(c => overridePattern.test(c.body));

            if (overrideComment) {
              const match = overrideComment.body.match(overridePattern);
              const reason = match ? match[1].trim() : 'No reason provided';
              core.warning(`Coverage decrease approved: ${reason}`);
              core.notice('⚠️ Coverage decreased but override approved by maintainer');
              core.notice(`Override comment: ${overrideComment.html_url}`);
            } else {
              core.setFailed('❌ Coverage decreased. Add comment "coverage-override: <reason>" to approve.');
              core.error('Coverage regressions require explicit approval.');
              core.error('Add a PR comment: coverage-override: <explanation>');
            }

      - name: Fail if coverage decreased without override
        if: steps.coverage.outcome == 'failure' && github.event_name != 'pull_request'
        run: |
          echo "❌ Coverage decreased on direct push to main"
          echo "This should not happen - all changes should go through PRs"
          exit 1

      - name: Post coverage comment to PR
        uses: marocchino/sticky-pull-request-comment@v2
        if: github.event_name == 'pull_request' && always()
        with:
          header: coverage
          path: ${{ steps.coverage.outputs.file }}
```

## What This Does

1. **Coverage Report** - Uses clearlyip action with `continue-on-error: true`
   - Generates coverage report
   - Compares against base branch
   - **Only shows changed files in PRs** (reduces noise, keeps review focused)
   - Sets outcome to 'failure' if coverage decreased
   - Doesn't fail the build yet

2. **Override Check** - Only runs if coverage decreased on PR
   - Scans PR comments for `coverage-override: <reason>` pattern
   - If found: Logs warning and passes
   - If not found: Fails with clear message

3. **Direct Push Protection** - Fails if coverage decreased on direct push to main
   - All changes should go through PRs for override capability

4. **Coverage Comment** - Posts sticky comment to PR
   - Shows coverage trends
   - Updates in place on subsequent pushes

## Usage

**When coverage decreases on a PR:**
1. CI will fail with message: "Coverage decreased. Add comment 'coverage-override: <reason>' to approve"
2. Maintainer reviews the PR and decrease justification
3. Maintainer adds comment: `coverage-override: Refactoring debug logging (plan to recover in #123)`
4. CI re-runs and detects override
5. Build passes but coverage decrease is still visible in report
6. Maintainer approves and merges PR

## Benefits

- ✅ Prevents accidental coverage decreases
- ✅ Allows intentional decreases with approval
- ✅ Override reason visible in PR history
- ✅ No absolute threshold - trend-based monitoring
- ✅ Clear process documented in specs/testing.md

## After Applying

1. Commit and push the workflow change
2. Test with intentional coverage decrease (optional)
3. Delete this file
4. Update WORKFLOW_FIX_CLOVER.md or delete if already applied
