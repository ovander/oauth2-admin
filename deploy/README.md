# Admin console deployment kit

Deploys the Socrate admin console to a Linux host that already runs Socrate: Caddy serves the
built SPA and the BFF runs as a systemd service on loopback. The kit mirrors the monitoring
console's ([oauth2-monitoring](https://github.com/ovander/oauth2-monitoring)), so both consoles
are operated the same way.

**Model:** build the artifacts on your workstation, rsync them to the host, install and restart
remotely. No build toolchain (Node, Go) runs on the host; it needs only Caddy, the static SPA
and the BFF binary, next to Socrate.

## Architecture

```
                 Internet (443)
                       │
                  ┌────▼─────┐   admin.example.com
                  │  Caddy   │   (only public listener)
                  └────┬─────┘
                       ├──────────────► file_server /srv/admin/dist (SPA): everything else
                       │ allowlisted paths (below)
                  ┌────▼─────┐
                  │admin BFF │   127.0.0.1:8091 (the only client of the admin API)
                  └──┬────┬──┘
                     │    └─────────────► Socrate issuer 127.0.0.1:8080
                     │                    (token, revocation, /api/profile,
                     │                     /api/version, password reset)
                     └─── Bearer ─────────► admin API 127.0.0.1:8081 (loopback only)
```

Allowlisted paths: `/bff/*`, `/api/admin/*`, `/api/apps/*`, `/api/profile`, `GET /api/version`,
and `POST /api/auth/request-password-reset` and `/api/auth/reset-password`.

## Before you start: host names

The kit's configuration files carry the production host names; change them for your
deployment:

- `deploy/Caddyfile`: the site address on the `admin.… {` line (and the comment above it).
- `/etc/socrate/admin-bff.env` (seeded from `deploy/env/admin-bff.env.example`):
  `BFF_PUBLIC_ORIGIN` (the console, for example `https://admin.example.com`) and
  `BFF_OAUTH_PUBLIC_URL` (the issuer, for example `https://socrate.example.com`).
- `deploy/scripts/bootstrap.sh` installs the Caddy site as `/etc/caddy/sites/<host>.caddy`, with
  the production host in the file name; rename it to match, or install the file by hand.

## Components and paths

| Component | Path / bind | Notes |
|---|---|---|
| Caddy site | `deploy/Caddyfile` → `/etc/caddy/sites/<host>.caddy` | Only public listener; TLS, CSP and security headers |
| Admin BFF | `/usr/local/bin/socrate-admin-bff`, binds `127.0.0.1:8091` | Hardened systemd unit, own user `socrate-admin-bff` |
| SPA static | `/srv/admin/dist` | Built locally, rsynced; **root-owned, 0644/0755**: the BFF user must not be able to modify it |
| Env (secrets) | `/etc/socrate/admin-bff.env` (`0640 root:socrate-admin-bff`) | The only place secrets live |
| Admin API | `127.0.0.1:8081` | Loopback only, never exposed |
| Backups | `/var/backups/socrate/<timestamp>/` | Previous binary, for rollback |

## First-time setup

```bash
# on the host, as root (idempotent)
sudo deploy/scripts/bootstrap.sh
```

It creates the service user and directories, installs the systemd unit, seeds the env file,
installs the Caddy site, and prints the next steps.

Then register a **confidential** OAuth client in Socrate with the redirect URI
`https://admin.example.com/bff/callback`, and fill `/etc/socrate/admin-bff.env`: client id and
secret (they stay only there), public origin and issuer URL. The variables are described in
[bff/README.md](../bff/README.md#configuration). Make sure the main `/etc/caddy/Caddyfile`
contains `import /etc/caddy/sites/*.caddy`.

## Deploy

```bash
# from your workstation
VPS_HOST=user@your-host deploy/scripts/push.sh    # VPS_PORT defaults to 22
# build.sh runs first (SKIP_BUILD=1 reuses the last build)
```

`push.sh` builds locally into `deploy/_artifacts/`, rsyncs the artifacts and the installer to a
temporary directory on the host, and runs `install-remote.sh` under sudo. The installer backs up
the current binary, installs the new one, syncs the SPA, runs `caddy validate`, restarts the
BFF, reloads Caddy, and **health-checks `http://127.0.0.1:8091/bff/healthz`**, restoring the
previous binary if it fails.

For the first deploy, enable the service once: `systemctl enable --now socrate-admin-bff`.
`push.sh` does not ship the Caddyfile: after changing it, re-run `bootstrap.sh` on the host (or
copy the file by hand) and reload Caddy.

## Rollback

Automatic on a failed health check. By hand:

```bash
ls /var/backups/socrate/                       # pick a timestamp
sudo install -m0755 /var/backups/socrate/<ts>/socrate-admin-bff /usr/local/bin/
sudo systemctl restart socrate-admin-bff
```

## Security notes

- **The admin API is loopback-only** (`127.0.0.1:8081`) and has no public host name. The BFF is
  its only client; the browser never reaches it directly.
- **The BFF is an allowlist**, never an open proxy: `/bff/*`, `/api/admin/*`, `/api/apps/*`,
  `/api/profile`, `GET /api/version` and the two password-reset posts. Everything else is 404.
- **Hardened systemd unit:** `NoNewPrivileges`, `ProtectSystem=strict`, no capabilities,
  `SystemCallFilter=@system-service`, `MemoryDenyWriteExecute`, and more.
- **Own service user:** the BFF runs as `socrate-admin-bff`, not as the identity server's
  `socrate`. The unit also hides `/var/lib/socrate` (signing keys) and the other services' env
  files with `InaccessiblePaths`, so a compromised BFF cannot reach the private key or
  `SECRET_KEY_BASE`.
- **Secrets** live only in `/etc/socrate/admin-bff.env` (`0640 root:socrate-admin-bff`), never
  in the repository or the SPA.
- **Do not set `trusted_proxies`** in Caddy unless another proxy sits in front of it: the BFF
  trusts `X-Forwarded-For` only from loopback, and relies on Caddy replacing any client value.

## Files

```
deploy/
├── Caddyfile                       # Caddy site block (host name to change)
├── systemd/socrate-admin-bff.service
├── env/admin-bff.env.example       # template for /etc/socrate/admin-bff.env
├── scripts/
│   ├── build.sh                    # local build → deploy/_artifacts/
│   ├── push.sh                     # local → host (rsync + remote install)
│   ├── install-remote.sh           # on the host (install + health check + rollback)
│   └── bootstrap.sh                # one-time host preparation (idempotent)
└── _artifacts/                     # build output (ignored by git)
```
