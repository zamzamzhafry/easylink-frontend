#!/usr/bin/env bash
# Pre-commit token gate — blocks NEW hardcoded color violations on staged .jsx/.tsx files.
# Existing debt is allowed (the bake-design skill + TOKEN-MIGRATION.md document the migration).
# This gate only fires on lines YOU add in THIS commit, so it can't block on legacy code.
#
# Install: ln -sf ../../scripts/pre-commit-token-gate.sh .git/hooks/pre-commit && chmod +x scripts/pre-commit-token-gate.sh
# Bypass:  git commit --no-verify (use sparingly — defeats the gate).

set -euo pipefail

# Pattern: text-white, text-slate-*, bg-slate-*, border-slate-*, divide-slate-*
# (on neutral surfaces — colored-bg button labels like bg-teal-600 text-white are fine,
#  this is a coarse first-line filter; review flagged lines for colored-bg context.)
PATTERN='(text-white|text-slate-|bg-slate-|border-slate-|divide-slate-)'

# Collect staged .jsx/.tsx files (added/modified only, not deleted).
mapfile -t files < <(git diff --cached --name-only --diff-filter=AM -- '*.jsx' '*.tsx' || true)

if [ ${#files[@]} -eq 0 ]; then
  exit 0
fi

violations=0
for f in "${files[@]}"; do
  [ -f "$f" ] || continue
  # Only check staged hunks (added lines) — not the whole file.
  while IFS= read -r line; do
    # git diff --cached -U0 shows added lines starting with '+'.
    # Strip the leading '+' and check for the pattern.
    content="${line#+}"
    if printf '%s' "$content" | grep -qE "$PATTERN"; then
      printf 'token-gate: %s: %s\n' "$f" "$content" >&2
      violations=$((violations + 1))
    fi
  done < <(git diff --cached -U0 -- "$f" | grep '^+[^+]' || true)
done

if [ "$violations" -gt 0 ]; then
  printf '\n' >&2
  printf 'token-gate: %d new hardcoded color violation(s) on neutral surface.\n' "$violations" >&2
  printf 'Use semantic tokens (text-foreground, bg-card, border-border) instead.\n' >&2
  printf 'See .claude/skills/bake-design/TOKEN-MIGRATION.md for the mapping.\n' >&2
  printf 'text-white on saturated colored-bg (bg-teal-*, bg-rose-*, etc.) is allowed.\n' >&2
  printf 'Bypass: git commit --no-verify\n' >&2
  exit 1
fi

exit 0
