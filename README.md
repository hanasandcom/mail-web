# Hanasand Mail

Standalone webmail for `mail.hanasand.com`. The Hanasand API owns mailbox data and
actions; this app forwards the signed-in session and does not store mailboxes. In
production the browser calls the public API directly, while local development defaults
to the same-origin proxy.

## Develop

Use Bun. The app runs on port 3000 by default:

```sh
bun install
bun run dev
```

Set `HANASAND_API_BASE` in `.env.local` to the API you intend to use. The app defaults
to `https://api.hanasand.com/api` when the variable is unset, so local mail actions can
reach the live API. The shared `id`, `access_token`, and `theme` cookies are scoped to
`.hanasand.com`; local development needs a suitable local authentication setup. Set
`NEXT_PUBLIC_MAIL_API_BASE` only when you want browser requests to bypass the local
proxy; production defaults to `https://api.hanasand.com/api`.

## Check

```sh
bun run typecheck
bun run build
```

Playwright tests run against this app's `/` route. In one terminal, start the mail
web app on port 3010 with `HANASAND_API_BASE` pointed at an isolated test API:

```sh
PORT=3010 HANASAND_API_BASE=http://127.0.0.1:8080/api bun run dev
```

In another terminal, run `bun run test`. `PLAYWRIGHT_BASE_URL` defaults to
`http://127.0.0.1:3010`, and `PLAYWRIGHT_API_BASE` defaults to
`http://127.0.0.1:8080/api`. The end-to-end suite creates accounts and sends mail, so
keep both the app proxy and test API on isolated test services. Tests default to the
same-origin proxy unless `NEXT_PUBLIC_MAIL_API_BASE` is set.

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
