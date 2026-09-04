#!/usr/bin/env bash
# Rebuild a framework's app from its starter with an agent following the skill, then test it.
# Usage: scripts/eval.sh <vanilla|nextjs|astro|sveltekit|nuxt|react-router|tanstack> [path-to-animaxxing-skills]
set -euo pipefail
FW="${1:?framework}"
SKILLS_REPO="${2:-$(cd "$(dirname "$0")/../../animaxxing-skills" && pwd)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
case "$FW" in
  vanilla) SKILL=gsap-vanilla ;;
  nextjs) SKILL=gsap-nextjs ;;
  astro) SKILL=gsap-astro ;;
  sveltekit) SKILL=gsap-sveltekit ;;
  nuxt) SKILL=gsap-nuxt ;;
  react-router) SKILL=gsap-react-router ;;
  tanstack) SKILL=gsap-tanstack-router ;;
  *) echo "unknown framework: $FW" >&2; exit 1 ;;
esac
EVAL="$ROOT/$FW/app-eval"
rm -rf "$EVAL"
cp -R "$ROOT/$FW/starter" "$EVAL"
cd "$EVAL"
npx -y skills add https://github.com/greensock/gsap-skills -a claude-code -s '*' -y
npx -y skills add "$SKILLS_REPO" -a claude-code -s "$SKILL" -y
cp "$ROOT/$FW/TASK.md" ./TASK.md
pnpm install
claude -p --permission-mode acceptEdits "Read TASK.md in this directory and do what it says. Use the $SKILL skill."
cd "$ROOT"
APP_DIR="$FW/app-eval" pnpm "test:$FW"
