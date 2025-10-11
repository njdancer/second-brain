#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function exec(command: string, silent = false): string {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: silent ? 'pipe' : 'inherit' });
  } catch (error) {
    throw new Error(`Command failed: ${command}`);
  }
}

function getCurrentVersion(): string {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
  return pkg.version;
}

function bumpVersion(current: string, type: 'patch' | 'minor' | 'major'): string {
  const [major, minor, patch] = current.split('.').map(Number);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const versionType = (args[0] || 'patch') as 'patch' | 'minor' | 'major';

  if (!['patch', 'minor', 'major'].includes(versionType)) {
    log(`Invalid version type: ${versionType}. Use patch, minor, or major.`, 'red');
    process.exit(1);
  }

  log('🚀 Second Brain MCP Release Process', 'green');
  console.log('');

  // Check working directory is clean
  try {
    const status = exec('git status --porcelain', true);
    if (status.trim()) {
      log('❌ Working directory must be clean', 'red');
      log('Commit or stash your changes first.', 'yellow');
      process.exit(1);
    }
  } catch {
    // Ignore
  }

  // Get current and new version
  const currentVersion = getCurrentVersion();
  const newVersion = bumpVersion(currentVersion, versionType);

  log(`Current version: v${currentVersion}`, 'yellow');
  log(`New version: v${newVersion}`, 'green');
  console.log('');

  // Run tests
  log('📝 Running pre-release checks...', 'yellow');
  log('  → Running tests...', 'yellow');
  try {
    exec('pnpm test', true);
    log('  ✓ Tests passed', 'green');
  } catch {
    log('❌ Tests failed', 'red');
    process.exit(1);
  }

  log('  → Running type check...', 'yellow');
  try {
    exec('pnpm run type-check', true);
    log('  ✓ Type check passed', 'green');
  } catch {
    log('❌ Type check failed', 'red');
    process.exit(1);
  }

  console.log('');
  log('📦 Updating version in all files...', 'yellow');

  // Update package.json (pnpm version handles pnpm-lock.yaml too)
  log('  → package.json & pnpm-lock.yaml', 'yellow');
  exec(`pnpm version ${newVersion} --no-git-tag-version`, true);

  // Update PLAN.md
  log('  → PLAN.md', 'yellow');
  const planPath = 'PLAN.md';
  let planContent = readFileSync(planPath, 'utf-8');
  planContent = planContent.replace(
    /\*\*Version:\*\* v[\d.]+/,
    `**Version:** v${newVersion}`
  );
  const today = new Date().toISOString().split('T')[0];
  planContent = planContent.replace(
    /\*\*Last Updated:\*\* \d{4}-\d{2}-\d{2}/,
    `**Last Updated:** ${today}`
  );
  writeFileSync(planPath, planContent, 'utf-8');

  // Update CHANGELOG.md
  log('  → CHANGELOG.md', 'yellow');
  const changelogPath = 'CHANGELOG.md';
  let changelogContent = readFileSync(changelogPath, 'utf-8');

  const newEntry = `## [${newVersion}] - ${today}

### Added
-

### Changed
-

### Fixed
-

---

`;

  // Insert after ## [Unreleased] section
  if (changelogContent.includes('## [Unreleased]')) {
    const lines = changelogContent.split('\n');
    const unreleasedIndex = lines.findIndex(line => line.includes('## [Unreleased]'));

    // Find the next section (---) after Unreleased
    let insertIndex = unreleasedIndex + 1;
    while (insertIndex < lines.length && !lines[insertIndex].startsWith('---')) {
      insertIndex++;
    }
    insertIndex++; // After the ---

    // Insert new entry
    lines.splice(insertIndex + 1, 0, newEntry);
    changelogContent = lines.join('\n');
  } else {
    // No Unreleased section, add at the beginning
    changelogContent = `# Changelog\n\n${newEntry}${changelogContent.replace(/^# Changelog\s*\n+/, '')}`;
  }

  writeFileSync(changelogPath, changelogContent, 'utf-8');

  log('  ✓ All files updated', 'green');
  console.log('');

  // Commit changes
  log('📝 Committing changes...', 'yellow');
  exec('git add package.json pnpm-lock.yaml PLAN.md CHANGELOG.md', true);
  exec(`git commit -m "chore: release v${newVersion}"`, true);

  // Create tag
  log(`🏷️  Creating git tag v${newVersion}...`, 'yellow');
  exec(`git tag -a v${newVersion} -m "Release v${newVersion}"`, true);

  console.log('');
  log(`✅ Release v${newVersion} prepared successfully!`, 'green');
  console.log('');
  log('Next steps:', 'yellow');
  log(`  1. Review the commit: ${colors.green}git show${colors.reset}`);
  log(`  2. Edit CHANGELOG.md to add release notes: ${colors.green}vim CHANGELOG.md${colors.reset}`);
  log(`  3. Amend commit if needed: ${colors.green}git add CHANGELOG.md && git commit --amend --no-edit${colors.reset}`);
  log(`  4. Push to GitHub: ${colors.green}git push origin main --tags${colors.reset}`);
  log(`  5. GitHub Actions will automatically deploy to production`);
  console.log('');
  log('If you need to undo this release:', 'yellow');
  log(`  ${colors.red}git tag -d v${newVersion}${colors.reset}`);
  log(`  ${colors.red}git reset --hard HEAD~1${colors.reset}`);
  console.log('');
}

main().catch((error) => {
  log(`❌ Error: ${error.message}`, 'red');
  process.exit(1);
});
