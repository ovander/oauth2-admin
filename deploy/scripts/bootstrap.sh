#!/usr/bin/env bash
# One-time VPS prep. Runs as root. Idempotent.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

# The admin BFF runs as its own no-login user (P4-1): it must not be able to
# read the identity server's signing keys or env, which belong to 'socrate'.
id -u socrate-admin-bff >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin socrate-admin-bff

echo "==> Directories"
# The SPA tree is root-owned and world-readable: Caddy only needs to read it,
# and the BFF service user must NOT be able to rewrite the JavaScript it serves
# to admins (a compromised BFF would otherwise become a persistent XSS). P3-25
install -d -o root -g root -m0755 /srv/admin /srv/admin/dist
install -d -m0755 /etc/socrate /var/backups/socrate

echo "==> systemd unit"
install -m0644 "$DEPLOY_DIR/systemd/socrate-admin-bff.service" /etc/systemd/system/socrate-admin-bff.service
systemctl daemon-reload

echo "==> env file"
if [ ! -f /etc/socrate/admin-bff.env ]; then
	install -m0640 "$DEPLOY_DIR/env/admin-bff.env.example" /etc/socrate/admin-bff.env
	echo "    seeded /etc/socrate/admin-bff.env — set BFF_CLIENT_SECRET (and check the other Phase 2 values) before starting;"
	echo "    the BFF refuses to run without server-side sessions unless BFF_PHASE1_PASSTHROUGH=true is set deliberately"
else
	echo "    /etc/socrate/admin-bff.env exists — left unchanged (ownership refreshed)"
fi
# P4-1: readable by root and this BFF's own user only. Applied on every run, so
# an install seeded before the user split is repaired by re-running bootstrap.
# Group "socrate" would let the identity server read this client secret.
chown root:socrate-admin-bff /etc/socrate/admin-bff.env
chmod 0640 /etc/socrate/admin-bff.env

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
