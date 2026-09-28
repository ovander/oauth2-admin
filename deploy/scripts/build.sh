#!/usr/bin/env bash
# Build SPA + admin BFF artifacts LOCALLY into deploy/_artifacts/.
# Keeps build toolchains off the VPS.
#
# Reproducible, tag-pinned builds:
#   By default builds the current working tree (historic behaviour). Pass a git
#   ref to build that exact committed tree instead, via a throwaway
#   `git worktree`, so no dirty local changes leak into a release and the SPA
#   carries the ref's package.json version.
#
#   REF     git ref (tag/branch/commit) for this repo — also the first
#           positional arg. Default: current working tree.
#   BFF_DIR override the bff/ location (default: <ref tree>/bff)
#
# Examples:
#   ./build.sh              # working tree (dev)
#   ./build.sh v1.4.0       # build the v1.4.0 tag
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
ARTIFACTS="$REPO_ROOT/deploy/_artifacts"
REF="${REF:-${1:-}}"

# Resolve the source tree: the working tree, or a throwaway worktree of REF.
_wt=""
cleanup() { [ -n "$_wt" ] && { git -C "$REPO_ROOT" worktree remove --force "$_wt" 2>/dev/null || rm -rf "$_wt"; }; }
trap cleanup EXIT
if [ -n "$REF" ]; then
	if ! git -C "$REPO_ROOT" rev-parse --verify --quiet "${REF}^{commit}" >/dev/null; then
		echo "✖ ref '$REF' not found in $REPO_ROOT (fetch tags first?)" >&2; exit 1
	fi
	_wt="$(mktemp -d)"
	git -C "$REPO_ROOT" worktree add --quiet --detach "$_wt" "$REF"
	SRC="$_wt"
else
	SRC="$REPO_ROOT"
fi
BFF_DIR="${BFF_DIR:-$SRC/bff}"
VERSION="$(git -C "$REPO_ROOT" describe --tags --always --dirty 2>/dev/null || echo dev)"
[ -n "$REF" ] && VERSION="$REF"
echo "==> Building admin console (ref: ${REF:-working tree}, version: $VERSION)"

rm -rf "$ARTIFACTS"
mkdir -p "$ARTIFACTS/admin" "$ARTIFACTS/bin"

echo "==> Building SPA"
( cd "$SRC" && npm ci && npm run build )
cp -R "$SRC/dist" "$ARTIFACTS/admin/dist"

echo "==> Building admin BFF"
if [ -d "$BFF_DIR" ]; then
	( cd "$BFF_DIR" && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
		go build -trimpath -ldflags="-s -w" -o "$ARTIFACTS/bin/socrate-admin-bff" . )
	echo "    built $ARTIFACTS/bin/socrate-admin-bff"
else
	echo "    bff/ not present — skipping BFF build (Phase 1 not merged yet)"
fi

printf '%s\n' "$VERSION" > "$ARTIFACTS/ADMIN_VERSION"
echo "==> Artifacts ready in $ARTIFACTS"
