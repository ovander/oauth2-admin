# Admin Console — Deployment Kit

Production deployment for the Socrate **admin console** (`admin.vandermoten.eu`)
on the single Linux VPS. Mirrors the monitoring console's kit so the whole VPS
is operationally consistent.

**Model:** build artifacts **locally**, rsync to the VPS, install + restart
remotely. Build toolchains (Node/Go) stay **off** the VPS — it runs only Caddy,
Postgres, the static SPA, and the BFF binary.

## Architecture

```
                Internet (443)
                     │
                ┌────▼─────┐   admin.vandermoten.eu
                │  Caddy   │   (only public listener)
                └────┬─────┘
        /bff/*, /api/admin/* │      else
                     │       └────────────► file_server  /srv/admin/dist  (SPA)
              ┌──────▼───────┐
              │  admin BFF   │  127.0.0.1:8091  (the only client of the admin API)
              └──────┬───────┘
                     │ Bearer (server-side)
              ┌──────▼───────┐
              │  admin API   │  127.0.0.1:8081  (loopback only, no public subdomain)
              └──────────────┘
```

## Components & paths

| Component | Path / bind | Notes |
|---|---|---|
| Caddy site | `deploy/Caddyfile` → `/etc/caddy/sites/admin.vandermoten.eu.caddy` | Only public listener; CSP + security headers |
| Admin BFF | `/usr/local/bin/socrate-admin-bff`, binds `127.0.0.1:8091` | Hardened systemd unit, user `socrate` |
| SPA static | `/srv/admin/dist` | Built locally, rsync'd |
| Env (secrets) | `/etc/socrate/admin-bff.env` (`0640 root:socrate`) | Only place secrets live |
| Admin API | `127.0.0.1:8081` | Loopback only — never exposed |
| Backups | `/var/backups/socrate/<timestamp>/` | Previous binary, for rollback |

## First-time setup

```bash
# on the VPS, as root (idempotent)
sudo deploy/scripts/bootstrap.sh
# → creates dirs, installs the systemd unit, seeds the env file, installs the
#   Caddy site, and prints a next-steps runbook.
```

Then register a **confidential** OAuth client in Socrate and fill
`/etc/socrate/admin-bff.env` (client_id + secret stay only there).

## Deploy

```bash
# from your workstation
VPS_HOST=user@admin-vps deploy/scripts/push.sh
# build.sh runs automatically (SKIP_BUILD=1 to reuse the last build).
```

`push.sh` builds locally → rsyncs `_artifacts/` + the installer to a temp dir →
runs `install-remote.sh` under sudo. The installer backs up the current binary,
installs the new one, syncs the SPA, `caddy validate`s, restarts the BFF, reloads
Caddy, and **health-checks `127.0.0.1:8091/bff/healthz`** — rolling back the
binary on failure.

## Rollback

Automatic on a failed health check. Manual:

```bash
ls /var/backups/socrate/                       # pick a timestamp
sudo install -m0755 /var/backups/socrate/<ts>/socrate-admin-bff /usr/local/bin/
sudo systemctl restart socrate-admin-bff
```

## Security notes

- **Admin API is loopback-only** (`127.0.0.1:8081`) and has no public subdomain.
  The BFF is its only client; the browser never reaches it directly.
- **BFF is an allowlist**, never an open proxy — only `/bff/*` and `/api/admin/*`.
- **Hardened systemd unit:** `NoNewPrivileges`, `ProtectSystem=strict`, dropped
  capabilities, `SystemCallFilter=@system-service`, `MemoryDenyWriteExecute`, etc.
- **Secrets** live only in `/etc/socrate/admin-bff.env` (`0640 root:socrate`),
  never in the repo or the SPA. The confidential OAuth client_id/secret are held
  by the BFF alone.
- Once the SPA is cookie-only, there is **no direct browser→admin-API path** —
  all admin traffic flows through the BFF.

## Files

```
deploy/
├── Caddyfile                       # admin.vandermoten.eu site block
├── systemd/socrate-admin-bff.service
├── env/admin-bff.env.example
├── scripts/
│   ├── build.sh                    # local → deploy/_artifacts/
│   ├── push.sh                     # local → VPS (rsync + remote install)
│   ├── install-remote.sh           # on VPS (install + health-check + rollback)
│   └── bootstrap.sh                # one-time VPS prep (idempotent)
└── _artifacts/                     # build output (gitignored)
```
