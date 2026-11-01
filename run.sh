#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./run.sh [start|stop|status|logs [api|web]|help]

  start   Build and start both Docker services; wait until healthy (default).
  stop    Remove containers and network; preserve the saved-world volume.
  status  Show containers, health, and published ports.
  logs    Follow the last 100 log lines; optionally select api or web.
  help    Show this message.

Override ports when starting: WEB_PORT=18081 API_PORT=3001 ./run.sh
Docker Desktop must be running with WSL integration enabled for Ubuntu.
USAGE
}

action="${1:-start}"
if (( $# > 0 )); then shift; fi
case "$action" in
  help|-h|--help) usage; exit 0 ;;
  start|stop|status)
    if (( $# > 0 )); then usage >&2; exit 2; fi
    ;;
  logs)
    if (( $# > 1 )) || { (( $# == 1 )) && [[ "$1" != api && "$1" != web ]]; }; then
      usage >&2
      exit 2
    fi
    ;;
  *) usage >&2; exit 2 ;;
esac

# Resolve Compose files relative to this script, even when called elsewhere.
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if ! command -v docker >/dev/null 2>&1; then
  printf 'Docker is unavailable. Install/start Docker Desktop and enable Ubuntu WSL integration.\n' >&2
  exit 1
fi
if ! docker compose version >/dev/null; then
  printf 'Docker Compose is unavailable. Check Docker Desktop → Settings → Resources → WSL Integration.\n' >&2
  exit 1
fi
if ! docker info >/dev/null; then
  printf 'Cannot reach Docker. Start Docker Desktop and check Ubuntu WSL integration.\n' >&2
  exit 1
fi

case "$action" in
  start)
    if ! docker compose up --build -d --wait; then
      printf 'Startup failed. Inspect ./run.sh logs; override occupied ports with WEB_PORT/API_PORT.\n' >&2
      exit 1
    fi
    web_address="$(docker compose port web 80)"
    api_address="$(docker compose port api 3000)"
    printf '\nWorkbench: http://%s\nAPI base:  http://%s/api\n' "$web_address" "$api_address"
    printf 'Use ./run.sh logs to follow output, or ./run.sh stop to stop services.\n'
    ;;
  stop)
    docker compose down
    printf 'Services stopped. Saved Docker worlds are preserved.\n'
    ;;
  status) docker compose ps ;;
  logs) docker compose logs --tail 100 -f "$@" ;;
esac
