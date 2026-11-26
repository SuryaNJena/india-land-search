# OCI VM deployment

This replaces the CareNest app on `carenest-landing` with the Odisha API only.
It must not touch the separate `postgres` VM. Before deployment, the current
CareNest boot volume is backed up in OCI as
`carenest-landing-before-india-land-search-2026-11-26`.

## Runtime

- OCI `VM.Standard.E2.1.Micro`, Ubuntu 26.04 Minimal, region `ap-hyderabad-1`.
- Node 24 in a read-only Docker container, limited to 384 MB and 0.5 CPU.
- Caddy terminates HTTPS for `https://api.129.154.35.213.nip.io` and proxies to
  `127.0.0.1:8787`; the application port is never exposed publicly.
- Copy `api.env.example` to `/etc/india-land-search/api.env`, edit the allowed
  Pages origins, and restrict the file to root (`chmod 600`). There are no API
  credentials or databases.

## Deploy commands

Run these from the repository root after reviewing and merging the PR. Build
and load the image on the VM, or build on a compatible Linux machine and move
the image archive over SSH. Do not put private keys or `api.env` in the repo.

```sh
docker build -f backend/Dockerfile -t india-land-search-api:current .
sudo install -d -m 0755 /opt/india-land-search /etc/india-land-search
sudo install -m 0644 backend/deploy/oci/india-land-search-api.service /etc/systemd/system/
sudo install -m 0644 backend/deploy/oci/Caddyfile /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now india-land-search-api
sudo systemctl reload caddy
curl --fail https://api.129.154.35.213.nip.io/healthz
```

Before applying the replacement configuration, archive `/etc/caddy/Caddyfile`
and stop/remove only the old CareNest app container and `/srv/carenest-vm` site
content. Keep Docker, Caddy, the OS, the Oracle Cloud Agent, SSH, and host
security services. The OCI boot-volume backup is the rollback for the old site.

## GitHub Pages

Set repository variable `LANDREVIEW_API_BASE` to
`https://api.129.154.35.213.nip.io` if the host changes. The Pages workflow
uses this public, non-secret value in the generated `runtime.mjs` and CSP.
Check the health endpoint, an allowed-origin preflight, and one selected-village
lookup from Pages after deployment. These checks should not run a statewide
village sweep.

## Rollback

Restore the archived Caddyfile, restart the previous CareNest container from
its recorded image/configuration, and restore `/srv/carenest-vm` from the OCI
boot-volume backup if needed. The PostgreSQL VM is independent of this rollout.
