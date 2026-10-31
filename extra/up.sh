#!/usr/bin/env sh
set -eu

# The host port; docker-compose.yml publishes the app on the same variable.
export DDOCK_PORT="${DDOCK_PORT:-5173}"
URL="http://localhost:${DDOCK_PORT}"

# --sourced mounts the local checkouts of the Python packages (brasidatacenter,
# ontobdc), so the app builds their wheels instead of using the pinned ones.
SOURCED="no"
for ARGUMENT in "$@"; do
  case "$ARGUMENT" in
    --sourced) SOURCED="yes" ;;
    *)
      printf 'usage: %s [--sourced]\n' "$0" >&2
      exit 2
      ;;
  esac
done

set -- --file ./docker/docker-compose.yml
if [ "$SOURCED" = "yes" ]; then
  set -- "$@" --file ./docker/docker-compose.sources.yml
fi

docker compose "$@" up -d --force-recreate --build --wait --renew-anon-volumes

printf '\n The OBDC DDOCK is running at %s\n' "$URL"

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 &
elif command -v cmd.exe >/dev/null 2>&1; then
  cmd.exe /c start "" "$URL" >/dev/null 2>&1 || true
fi
