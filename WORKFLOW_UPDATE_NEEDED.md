# Workflow Update Needed: Add Sticky PR Comments for Coverage

## Issue

The `clearlyip/code-coverage-report-action` generates coverage reports but doesn't post them to PRs automatically. According to its documentation, it's designed to work with `marocchino/sticky-pull-request-comment` to post coverage as PR comments.

## Required Change

Add the sticky comment action to `.github/workflows/test.yml` after the coverage report step.

### Current Code (line 144-151)

```yaml
      - name: Report code coverage
        uses: clearlyip/code-coverage-report-action@v5
        if: always()
        with:
          filename: 'coverage/lcov.info'
          overall-coverage-fail-threshold: '95'
          badge: true
          fail-on-negative-difference: true
```

### Updated Code

```yaml
      - name: Report code coverage
        uses: clearlyip/code-coverage-report-action@v5
        id: coverage
        if: always()
        with:
          filename: 'coverage/lcov.info'
          overall-coverage-fail-threshold: '95'
          badge: true
          fail-on-negative-difference: true

      - name: Post coverage comment to PR
        uses: marocchino/sticky-pull-request-comment@v2
        if: github.event_name == 'pull_request' && always()
        with:
          header: coverage
          message: ${{ steps.coverage.outputs.report }}
```

## Changes Explained

1. **Add `id: coverage`** - Allows referencing the output from the coverage action
2. **Add new step** - Posts the coverage report output as a PR comment
3. **`sticky-pull-request-comment`** - Updates the same comment on subsequent pushes (keeps PRs clean)
4. **Conditional** - Only posts on pull requests, not on direct pushes to main

## Benefits

- ✅ Coverage reports visible directly in PRs (no need to check CI logs)
- ✅ "Sticky" comments update in place, keeping PRs clean
- ✅ Shows coverage trends and differences from base branch
- ✅ Recommended integration per clearlyip action documentation

## How to Apply

1. Edit `.github/workflows/test.yml`
2. Replace the "Report code coverage" step (lines 144-151) with the updated code above
3. Commit and push the change
4. Delete this file after applying
