#!/usr/bin/env bash
# Build SPA + admin BFF artifacts LOCALLY into deploy/_artifacts/.
# Keeps build toolchains off the VPS.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
ARTIFACTS="$REPO_ROOT/deploy/_artifacts"
BFF_DIR="${BFF_DIR:-$REPO_ROOT/bff}"

rm -rf "$ARTIFACTS"
mkdir -p "$ARTIFACTS/admin" "$ARTIFACTS/bin"

echo "==> Building SPA"
cd "$REPO_ROOT"
npm ci
npm run build
cp -R "$REPO_ROOT/dist" "$ARTIFACTS/admin/dist"

echo "==> Building admin BFF"
if [ -d "$BFF_DIR" ]; then
	( cd "$BFF_DIR" && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
		go build -trimpath -ldflags="-s -w" -o "$ARTIFACTS/bin/socrate-admin-bff" . )
	echo "    built $ARTIFACTS/bin/socrate-admin-bff"
else
	echo "    bff/ not present — skipping BFF build (Phase 1 not merged yet)"
fi

echo "==> Artifacts ready in $ARTIFACTS"
