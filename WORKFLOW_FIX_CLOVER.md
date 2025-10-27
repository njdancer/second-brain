# Critical Fix Required: Update Coverage File Format in test.yml

## Issue

The `clearlyip/code-coverage-report-action` is failing with:
```
##[warning]Unable to parse coverage/lcov.info
##[error]Unable to process coverage/lcov.info
```

**Root Cause:** The action only supports **Clover** and **Cobertura** formats, not lcov.

## Jest Configuration Fixed

✅ Jest has been updated to generate `coverage/clover.xml` (already committed)

## Workflow Update Required

Update `.github/workflows/test.yml` line 149:

### Current (BROKEN):
```yaml
      - name: Report code coverage
        uses: clearlyip/code-coverage-report-action@v5
        id: coverage
        if: always()
        with:
          filename: 'coverage/lcov.info'  # ❌ This file format is not supported
          overall_coverage_fail_threshold: '95'
          badge: true
          fail_on_negative_difference: true
```

### Fixed:
```yaml
      - name: Report code coverage
        uses: clearlyip/code-coverage-report-action@v5
        id: coverage
        if: always()
        with:
          filename: 'coverage/clover.xml'  # ✅ Supported Clover format
          overall_coverage_fail_threshold: '95'
          badge: true
          fail_on_negative_difference: true
```

## How to Apply

1. Edit `.github/workflows/test.yml`
2. Change line 149 from `filename: 'coverage/lcov.info'` to `filename: 'coverage/clover.xml'`
3. Commit and push
4. Delete this file

**This is a ONE-LINE change** - just update the filename parameter.

## Verification

After applying, CI should:
- ✅ Parse coverage/clover.xml successfully
- ✅ Generate coverage report
- ✅ Post sticky comment to PRs (if PR event)
- ✅ Upload coverage badge
- ✅ Fail CI on coverage decreases (per specs/testing.md)
