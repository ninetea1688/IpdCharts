#!/usr/bin/env bash
# guard-bash.sh — PreToolUse hook: block destructive/dangerous Bash commands.
# Receives JSON on stdin: {"tool_name":"Bash","tool_input":{"command":"..."}}
# Exit 0 = allow, non-zero = block (output shown to user).
set -u

input="$(cat)"

# Only guard the Bash tool.
case "$input" in
  *'"tool_name":"Bash"'*) ;;
  *) exit 0 ;;
esac

# Extract the command string (macOS has python3; if unavailable, allow — guard is best-effort).
command_str="$(printf '%s' "$input" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get("tool_input", {}).get("command", ""))
except Exception:
    print("")
' 2>/dev/null)"
[ -n "$command_str" ] || exit 0

blocked_patterns=(
  # Filesystem destruction
  'rm[[:space:]]+-(rf|fr)[[:space:]]+/(\*)?([[:space:]]|$)'      # rm -rf / or /*
  'rm[[:space:]]+-(rf|fr)[[:space:]]+~([[:space:]]|$)'          # rm -rf ~ (home)
  'rm[[:space:]]+-(rf|fr)[[:space:]]+\$HOME([[:space:]]|$)'     # rm -rf $HOME
  'rm[[:space:]]+-(rf|fr)[[:space:]]+/Users/'                   # any absolute path under home
  'rm[[:space:]]+-(rf|fr)[[:space:]]+\*([[:space:]]|$)'         # rm -rf * (cwd wipe)
  'rm[[:space:]]+-(rf|fr)[[:space:]]+\.(/)?([[:space:]]|$)'      # rm -rf . or ./
  'rm[[:space:]]+-rf[[:space:]]+--no-preserve-root'             # explicit no-preserve-root
  # Git history/state destruction
  'git[[:space:]]+push[[:space:]]+--force'                      # force push
  'git[[:space:]]+push[[:space:]]+-f([[:space:]]|$)'
  'git[[:space:]]+reset[[:space:]]+--hard'
  'git[[:space:]]+clean[[:space:]]+-f'
  'git[[:space:]]+branch[[:space:]]+-D'
  # Database destruction
  'DROP[[:space:]]+(TABLE|DATABASE)'
  'TRUNCATE[[:space:]]+(TABLE[[:space:]]+)?[A-Za-z_]+'
  # Raw device / disk
  'mkfs\.[a-z0-9]+'
  'dd[[:space:]]+if=[^[:space:]]+[[:space:]]+of=/dev/'
  # Fork bomb
  ':\(\)\{'
)

for pattern in "${blocked_patterns[@]}"; do
  if printf '%s' "$command_str" | grep -qiE "$pattern"; then
    echo "BLOCKED by guard-bash.sh: command matches dangerous pattern: ${pattern}"
    echo "If this is intentional, run it manually outside the agent."
    exit 1
  fi
done

exit 0
