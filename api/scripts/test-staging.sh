#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
project="hanasand-mail-api-staging"
compose=(docker compose --project-name "$project" -f "$root/compose.staging.yml")
cleanup() { "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

"${compose[@]}" up -d --build --wait
docker compose --project-name "$project" -f "$root/compose.staging.yml" exec -T mail-api bun -e '
const health = await fetch("http://127.0.0.1:8081/health")
const healthBody = await health.json()
if (!health.ok || healthBody.service !== "mail-api") throw new Error("Mail API health failed")

const unauthorized = await fetch("http://127.0.0.1:8081/api/mail/overview")
if (unauthorized.status !== 401) throw new Error(`Unauthenticated overview returned ${unauthorized.status}, expected 401`)

const preflight = await fetch("http://127.0.0.1:8081/api/mail/overview", {
  method: "OPTIONS",
  headers: {
    Origin: "https://hanasand.com",
    "Access-Control-Request-Method": "GET",
    "Access-Control-Request-Headers": "authorization,content-type,id,dpop",
  },
})
if (preflight.headers.get("access-control-allow-origin") !== "https://hanasand.com") throw new Error("Dashboard origin is not allowed by CORS")
if (!preflight.headers.get("access-control-allow-headers")?.toLowerCase().includes("authorization")) throw new Error("Authorization is not allowed by CORS")
console.log("Staging passed: database-backed health, unauthorized request rejection, and dashboard CORS.")
'
