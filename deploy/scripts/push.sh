#!/usr/bin/env bash
# Build (unless SKIP_BUILD=1) and ship artifacts to the VPS, then run the remote
# installer. Requires: VPS_HOST=user@host  (VPS_PORT defaults to 22).
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
ARTIFACTS="$REPO_ROOT/deploy/_artifacts"

: "${VPS_HOST:?set VPS_HOST=user@host}"
VPS_PORT="${VPS_PORT:-22}"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
	"$SCRIPT_DIR/build.sh"
fi
[ -d "$ARTIFACTS" ] || { echo "no artifacts at $ARTIFACTS — run build.sh first"; exit 1; }

REMOTE_TMP="/tmp/socrate-admin-deploy.$$"
SSH=(ssh -p "$VPS_PORT" "$VPS_HOST")
RSH="ssh -p $VPS_PORT"

echo "==> Shipping to $VPS_HOST:$REMOTE_TMP"
"${SSH[@]}" "mkdir -p '$REMOTE_TMP/artifacts'"
rsync -az --delete -e "$RSH" "$ARTIFACTS/"            "$VPS_HOST:$REMOTE_TMP/artifacts/"
rsync -az          -e "$RSH" "$SCRIPT_DIR/install-remote.sh" "$VPS_HOST:$REMOTE_TMP/install-remote.sh"

echo "==> Installing remotely (sudo)"
"${SSH[@]}" "sudo bash '$REMOTE_TMP/install-remote.sh' '$REMOTE_TMP/artifacts'"
"${SSH[@]}" "rm -rf '$REMOTE_TMP'"
echo "==> Done"
