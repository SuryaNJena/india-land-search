#!/usr/bin/env bash
# Install root-owned on the OCI VM. The restricted SSH account passes one commit on stdin.
set -Eeuo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 077
IFS= read -r -t 20 release
[[ "$release" =~ ^[0-9a-f]{40}$ ]]
exec 9>/run/lock/india-land-search-deploy.lock
flock -n 9
repo=https://github.com/SuryaNJena/india-land-search.git
current=$(git ls-remote "$repo" refs/heads/main)
[[ ${current%%$'\t'*} == "$release" ]]
stage=$(mktemp -d /tmp/india-land-search-release.XXXXXXXX)
previous=''
changed=false
cleanup() {
  local result=$?
  trap - EXIT
  if [[ "$result" != 0 && "$changed" == true ]]; then
    docker tag "$previous" india-land-search-api:current
    systemctl restart india-land-search-api.service
  fi
  rm -rf -- "$stage"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
curl --fail --silent --show-error --proto '=https' --max-time 90 \
  "https://codeload.github.com/SuryaNJena/india-land-search/tar.gz/$release" -o "$stage/source.tar.gz"
tar -xzf "$stage/source.tar.gz" -C "$stage"
docker build --quiet -f "$stage/india-land-search-$release/backend/Dockerfile" \
  --label "org.opencontainers.image.revision=$release" -t "india-land-search-api:$release" "$stage/india-land-search-$release"
previous=$(docker image inspect --format '{{.Id}}' india-land-search-api:current)
changed=true
docker tag "india-land-search-api:$release" india-land-search-api:current
systemctl restart india-land-search-api.service
curl --fail --silent --show-error --retry 8 --retry-all-errors --retry-delay 2 \
  --max-time 20 http://127.0.0.1:8787/healthz
status=$(curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' \
  --header 'Origin: https://suryanjena.github.io' --header 'Content-Type: application/json' \
  --data '{"state":"unsupported"}' http://127.0.0.1:8787/api/state-maps)
[[ "$status" == 400 ]]
printf '\nVerified OCI release %s\n' "$release"
