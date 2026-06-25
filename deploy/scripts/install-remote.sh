#!/usr/bin/env bash
# Runs ON THE VPS as root. Installs the binary + SPA, validates Caddy, restarts
# the service, health-checks, and rolls back the binary on failure.
set -euo pipefail

ARTIFACTS="${1:?usage: install-remote.sh <artifacts-dir>}"
TS=$(date +%Y%m%d-%H%M%S)
BACKUP="/var/backups/socrate/$TS"

BIN_SRC="$ARTIFACTS/bin/socrate-admin-bff"
BIN_DST="/usr/local/bin/socrate-admin-bff"
SPA_SRC="$ARTIFACTS/admin/dist"
SPA_DST="/srv/admin/dist"

mkdir -p "$BACKUP"
[ -f "$BIN_DST" ] && cp -a "$BIN_DST" "$BACKUP/socrate-admin-bff"

rollback() {
	echo "!! deploy failed — rolling back" >&2
	if [ -f "$BACKUP/socrate-admin-bff" ]; then
		install -m0755 "$BACKUP/socrate-admin-bff" "$BIN_DST"
		systemctl restart socrate-admin-bff || true
	fi
	exit 1
}

# ── Binary (present only once the BFF has been built) ────────────────────────
if [ -f "$BIN_SRC" ]; then
	echo "==> Installing binary → $BIN_DST"
	install -m0755 "$BIN_SRC" "$BIN_DST"
fi

# ── SPA ──────────────────────────────────────────────────────────────────────
if [ -d "$SPA_SRC" ]; then
	echo "==> Syncing SPA → $SPA_DST"
	mkdir -p "$SPA_DST"
	rsync -a --delete "$SPA_SRC/" "$SPA_DST/"
	chown -R socrate:socrate "$SPA_DST"
fi

# ── Validate + restart ───────────────────────────────────────────────────────
if [ -f /etc/caddy/Caddyfile ]; then
	echo "==> caddy validate"
	caddy validate --config /etc/caddy/Caddyfile || rollback
fi
echo "==> Restarting socrate-admin-bff"
systemctl restart socrate-admin-bff || rollback
systemctl reload caddy || true

# ── Health check (gate on the BFF we just deployed) ──────────────────────────
echo "==> Health check"
ok=0
for _ in 1 2 3 4 5; do
	if curl -fsS http://127.0.0.1:8091/bff/healthz >/dev/null 2>&1; then ok=1; break; fi
	sleep 1
done
[ "$ok" = 1 ] || rollback
# Admin API is a separate service — soft-check only (don't roll back the BFF for it).
curl -fsS http://127.0.0.1:8081/health >/dev/null 2>&1 \
	|| echo "warn: admin API 127.0.0.1:8081/health not OK (continuing)"

echo "==> Deploy OK ($TS). Backup: $BACKUP"
