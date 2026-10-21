# Hanasand Mail

Standalone webmail for `mail.hanasand.com`. The Hanasand API owns mailbox data and
actions; this app does not store mailboxes. The browser calls `api.hanasand.com` directly
with the signed-in session. The API allows the mail site through its CORS policy, so mail
requests do not pass through another UI or a mail-specific proxy. OpenResty serves this
app at `mail.hanasand.com`. The page loads Identity's device-proof client before the
app and signs authenticated API requests with its browser-held P-256 key.

## Develop

Use Bun. The app runs on port 3000 by default:

```sh
bun install
bun run dev
```

Set `NEXT_PUBLIC_MAIL_API_BASE` in `.env.local` to the API you intend to use. It defaults
to `https://api.hanasand.com/api`. The shared `id`, `access_token`, and `theme` cookies
are scoped to `.hanasand.com`; local development needs a suitable local authentication
setup and an API CORS allowlist entry for the local mail origin.

## Check

```sh
bun run typecheck
bun run build
```

Playwright tests run against this app's `/` route. In one terminal, start the mail
web app on port 3010 with `NEXT_PUBLIC_MAIL_API_BASE` pointed at an isolated test API:

```sh
PORT=3010 NEXT_PUBLIC_MAIL_API_BASE=http://127.0.0.1:8080/api bun run dev
```

In another terminal, run `bun run test`. `PLAYWRIGHT_BASE_URL` defaults to
`http://127.0.0.1:3010`, and `PLAYWRIGHT_API_BASE` defaults to
`http://127.0.0.1:8080/api`. The end-to-end suite creates accounts and sends mail, so
keep the app and test API on isolated test services. Allow `http://127.0.0.1:3010` in
the test API's CORS configuration. `PLAYWRIGHT_API_BASE` configures only the test
suite's account setup and cleanup requests.

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
