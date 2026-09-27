#!/usr/bin/env bash
# Runs from npm preinstall during Netlify/CI install (before build command).
# Configures git URL rewrites so private github.com deps install over HTTPS.
set -euo pipefail
if [ -n "${IFN_UI_READ_TOKEN:-}" ]; then
  git config --global url."https://x-access-token:${IFN_UI_READ_TOKEN}@github.com/".insteadOf "https://github.com/"
  git config --global url."https://x-access-token:${IFN_UI_READ_TOKEN}@github.com/".insteadOf "ssh://git@github.com/"
  git config --global url."https://x-access-token:${IFN_UI_READ_TOKEN}@github.com/".insteadOf "git@github.com:"
else
  # Still prefer HTTPS over SSH when a token is not present (GitHub App / local gh).
  git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" || true
  git config --global url."https://github.com/".insteadOf "git@github.com:" || true
fi
