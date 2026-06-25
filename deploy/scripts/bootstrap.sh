#!/usr/bin/env bash
# One-time VPS prep. Runs as root. Idempotent.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

id -u socrate >/dev/null 2>&1 || { echo "service user 'socrate' must exist first"; exit 1; }

echo "==> Directories"
install -d -o socrate -g socrate -m0755 /srv/admin /srv/admin/dist
install -d -m0755 /etc/socrate /var/backups/socrate

echo "==> systemd unit"
install -m0644 "$DEPLOY_DIR/systemd/socrate-admin-bff.service" /etc/systemd/system/socrate-admin-bff.service
systemctl daemon-reload

echo "==> env file"
if [ ! -f /etc/socrate/admin-bff.env ]; then
	install -m0640 -o root -g socrate "$DEPLOY_DIR/env/admin-bff.env.example" /etc/socrate/admin-bff.env
	echo "    seeded /etc/socrate/admin-bff.env (edit before enabling Phase 2)"
else
	echo "    /etc/socrate/admin-bff.env exists — left unchanged"
fi

echo "==> Caddy site"
if [ -d /etc/caddy ]; then
	install -d -m0755 /etc/caddy/sites
	install -m0644 "$DEPLOY_DIR/Caddyfile" /etc/caddy/sites/admin.vandermoten.eu.caddy
	echo "    installed → /etc/caddy/sites/admin.vandermoten.eu.caddy"
	echo "    ensure the main /etc/caddy/Caddyfile contains: import /etc/caddy/sites/*.caddy"
else
	echo "    /etc/caddy not found — install $DEPLOY_DIR/Caddyfile into your Caddy config manually"
fi

cat <<'NEXT'

── Next steps ───────────────────────────────────────────────────────────────
1. Register a CONFIDENTIAL OAuth client in Socrate. Put client_id + secret in
   /etc/socrate/admin-bff.env (Phase 2). Secrets live ONLY in that file.
2. Fill /etc/socrate/admin-bff.env (BFF_PUBLIC_ORIGIN, BFF_OAUTH_*, …).
3. From your workstation:  VPS_HOST=user@host deploy/scripts/push.sh
4. Enable the service:     systemctl enable --now socrate-admin-bff
5. Reload Caddy:           systemctl reload caddy
───────────────────────────────────────────────────────────────────────────────
NEXT
