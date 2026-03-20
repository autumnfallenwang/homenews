#!/bin/bash
# Pre-commit/push hook: scan staged files for secrets

# Only run on git commit or git push
echo "$CLAUDE_BASH_COMMAND" | grep -qE '^git (commit|push)' || exit 0

# Check for sensitive keywords in staged diffs
SECRETS=$(git diff --cached --diff-filter=ACM -S 'password' -S 'secret' -S 'api_key' -S 'apikey' -S 'token' -S 'private_key' --name-only 2>/dev/null)

# Check for known secret patterns (API keys, private keys, etc.)
PATTERNS=$(git diff --cached --diff-filter=ACM -G '(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----|AKIA[0-9A-Z]{16})' --name-only 2>/dev/null)

# Check for .env files being committed
ENVFILES=$(git diff --cached --name-only 2>/dev/null | grep -E '\.env$|\.env\.' | grep -v '\.example$')

FOUND="${SECRETS}${PATTERNS}${ENVFILES}"

if [ -n "$FOUND" ]; then
  echo "BLOCKED: Potential secrets detected in staged files:" >&2
  echo "$FOUND" | sort -u >&2
  echo "Review these files before committing." >&2
  exit 2
fi

exit 0
