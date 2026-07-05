#!/usr/bin/env bash
# Claude Code WorktreeCreate hook. When this hook is configured, Claude Code delegates
# worktree creation to it entirely: stdin carries hook JSON with the requested worktree
# name in .name, and the last non-empty stdout line must be the created worktree path.
# Setup output goes to stderr so it cannot corrupt the path contract.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$PWD}"

name=$(jq -r '.name // empty')
if [ -z "$name" ]; then
  echo "WorktreeCreate hook input had no worktree name" >&2
  exit 1
fi

# Resolve the main checkout even when this session runs inside another worktree.
main_root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
worktree_path="$main_root/.claude/worktrees/$name"
branch="worktree-$name"

if [ ! -d "$worktree_path" ]; then
  base=$(git rev-parse --verify --quiet origin/main || git rev-parse HEAD)
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    git worktree add "$worktree_path" "$branch" >&2
  else
    git worktree add -b "$branch" "$worktree_path" "$base" >&2
  fi
  (cd "$worktree_path" && pnpm run setup:worktree) >&2
fi

echo "$worktree_path"
