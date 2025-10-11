#!/bin/bash
set -e

# Release script for second-brain-mcp
# Usage: ./scripts/release.sh [patch|minor|major|<version>] [--no-edit]
# Example: ./scripts/release.sh patch  # 1.2.3 -> 1.2.4
# Example: ./scripts/release.sh minor  # 1.2.3 -> 1.3.0
# Example: ./scripts/release.sh major  # 1.2.3 -> 2.0.0
# Example: ./scripts/release.sh 1.5.0  # explicit version
# Example: ./scripts/release.sh patch --no-edit  # skip CHANGELOG editor

VERSION_TYPE="${1:-patch}"
NO_EDIT=false

# Check for --no-edit flag
for arg in "$@"; do
  if [ "$arg" = "--no-edit" ]; then
    NO_EDIT=true
  fi
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Second Brain MCP Release Process${NC}"
echo ""

# Ensure we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo -e "${RED}❌ Error: Must be on main branch (currently on $CURRENT_BRANCH)${NC}"
  exit 1
fi

# Ensure working directory is clean
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}❌ Error: Working directory must be clean${NC}"
  echo "Commit or stash your changes first."
  exit 1
fi

# Ensure we're up to date with remote
echo -e "${YELLOW}📡 Fetching from remote...${NC}"
git fetch origin main

if [ "$(git rev-parse HEAD)" != "$(git rev-parse @{u})" ]; then
  echo -e "${RED}❌ Error: Local branch is not up to date with remote${NC}"
  echo "Run: git pull origin main"
  exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}Current version: ${NC}v$CURRENT_VERSION"

# Calculate new version using pnpm
if [[ "$VERSION_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VERSION="$VERSION_TYPE"
else
  # Use npm's semver logic to calculate new version
  NEW_VERSION=$(npm version --no-git-tag-version "$VERSION_TYPE" | sed 's/^v//')
  # Restore package.json (we'll use pnpm version later)
  git checkout package.json pnpm-lock.yaml
fi

echo -e "${GREEN}New version: ${NC}v$NEW_VERSION"
echo ""

# Confirm
read -p "$(echo -e ${YELLOW}Continue with release v$NEW_VERSION? [y/N]: ${NC})" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${RED}Release cancelled${NC}"
  exit 1
fi

echo ""
echo -e "${YELLOW}📝 Running pre-release checks...${NC}"

# Run tests
echo -e "${YELLOW}  → Running tests...${NC}"
pnpm test > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Tests failed. Fix tests before releasing.${NC}"
  pnpm test
  exit 1
fi
echo -e "${GREEN}  ✓ Tests passed${NC}"

# Run type check
echo -e "${YELLOW}  → Running type check...${NC}"
pnpm run type-check > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Type check failed. Fix type errors before releasing.${NC}"
  pnpm run type-check
  exit 1
fi
echo -e "${GREEN}  ✓ Type check passed${NC}"

echo ""
echo -e "${YELLOW}📦 Updating version in all files...${NC}"

# Update package.json using pnpm (also updates pnpm-lock.yaml)
echo -e "${YELLOW}  → package.json & pnpm-lock.yaml${NC}"
pnpm version "$NEW_VERSION" --no-git-tag-version > /dev/null

# Update PLAN.md
echo -e "${YELLOW}  → PLAN.md${NC}"
sed -i '' "s/\*\*Version:\*\* v[0-9]\+\.[0-9]\+\.[0-9]\+/**Version:** v$NEW_VERSION/" PLAN.md

# Update PLAN.md last updated date
TODAY=$(date +%Y-%m-%d)
sed -i '' "s/\*\*Last Updated:\*\* [0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}/**Last Updated:** $TODAY/" PLAN.md

# Update CHANGELOG.md
echo -e "${YELLOW}  → CHANGELOG.md${NC}"
CHANGELOG_ENTRY="## [$NEW_VERSION] - $TODAY

### Added
- Automated release process with version management script
- Release commands in package.json (release, release:minor, release:major)

### Changed
- Deployment documentation updated to reflect tag-based workflow
- PLAN.md streamlined with release process status

### Fixed
- macOS compatibility for release script (awk instead of sed)

"

# Insert after the header (assumes ## [Unreleased] or similar at top)
if grep -q "## \[Unreleased\]" CHANGELOG.md; then
  # Insert after Unreleased section using temp file (macOS sed compatibility)
  awk -v entry="$CHANGELOG_ENTRY" '
    /^## \[Unreleased\]/ { print; print ""; print entry; next }
    { print }
  ' CHANGELOG.md > CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md
else
  # Insert at the beginning of changelog entries
  awk -v entry="$CHANGELOG_ENTRY" '
    /^## / && !inserted { print entry; inserted=1 }
    { print }
  ' CHANGELOG.md > CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md
fi

echo -e "${GREEN}  ✓ All files updated${NC}"

echo ""
if [ "$NO_EDIT" = false ]; then
  echo -e "${YELLOW}📝 Please update CHANGELOG.md with release notes${NC}"
  echo -e "${YELLOW}Opening CHANGELOG.md in your editor...${NC}"
  sleep 2

  # Open CHANGELOG.md in editor
  ${EDITOR:-vim} CHANGELOG.md
else
  echo -e "${YELLOW}📝 Skipping CHANGELOG.md editor (--no-edit flag)${NC}"
  echo -e "${YELLOW}CHANGELOG.md updated with template - edit manually if needed${NC}"
fi

echo ""
echo -e "${YELLOW}📝 Committing changes...${NC}"

# Stage all version changes
git add package.json pnpm-lock.yaml PLAN.md CHANGELOG.md

# Commit
git commit -m "chore: release v$NEW_VERSION"

# Create tag
echo -e "${YELLOW}🏷️  Creating git tag v$NEW_VERSION...${NC}"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo ""
echo -e "${GREEN}✅ Release v$NEW_VERSION prepared successfully!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Review the commit: ${GREEN}git show${NC}"
echo -e "  2. Push to GitHub: ${GREEN}git push origin main --tags${NC}"
echo -e "  3. GitHub Actions will automatically deploy to production"
echo ""
echo -e "${YELLOW}If you need to undo this release:${NC}"
echo -e "  ${RED}git tag -d v$NEW_VERSION${NC}"
echo -e "  ${RED}git reset --hard HEAD~1${NC}"
echo ""
