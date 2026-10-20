# Hanasand Mail

Standalone webmail for `mail.hanasand.com`. This repository contains the browser UI and
its same-origin API proxy. The Hanasand API owns mailbox data and actions; this app
forwards the signed-in session and does not store mailboxes.

## Develop

Use Bun. The app runs on port 3000 by default:

```sh
bun install
bun run dev
```

Set `HANASAND_API_BASE` in `.env.local` to the API you intend to use. The app defaults
to `https://api.hanasand.com/api` when the variable is unset, so local mail actions can
reach the live API. The shared `id`, `access_token`, and `theme` cookies are scoped to
`.hanasand.com`; local development needs a suitable local authentication setup.

## Check

```sh
bun run typecheck
bun run build
```

Playwright tests run with `bun run test`. They need a web app at
`PLAYWRIGHT_BASE_URL` (default `http://127.0.0.1:3010`) and a test API at
`PLAYWRIGHT_API_BASE` (default `http://127.0.0.1:8080/api`). The end-to-end suite
creates accounts and sends mail, so use an isolated test environment.

## Sign in

Production sign-in starts at `https://hanasand.com/dashboard/mail` and returns to the
mail site after login. Local development does not receive the production domain's
cookies automatically.

## Deploy

Push `main` to this repository, fast-forward the checkout on the mail host, then run
`scripts/deploy.sh` from that clean checkout. The script builds and health-checks a
candidate before switching the `mail.hanasand.com` OpenResty route to it.

The Stalwart server and SMTP relay are deployed separately from the
[mail-server repository](https://github.com/hanasandcom/mail-server).
