#!/usr/bin/env bash
# Runs from npm preinstall during Netlify/CI install (before deps fetch completes).
set -euo pipefail
TOKEN="${IFN_UI_READ_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -n "${TOKEN}" ]; then
  git config --global url."https://x-access-token:${TOKEN}@github.com/".insteadOf "https://github.com/"
  git config --global url."https://x-access-token:${TOKEN}@github.com/".insteadOf "ssh://git@github.com/"
  git config --global url."https://x-access-token:${TOKEN}@github.com/".insteadOf "git@github.com:"
  # npm sometimes prefers ssh:// for github: shorthand
  git config --global url."https://x-access-token:${TOKEN}@github.com/".insteadOf "ssh://git@github.com/"
else
  git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" || true
  git config --global url."https://github.com/".insteadOf "git@github.com:" || true
fi
