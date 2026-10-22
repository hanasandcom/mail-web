# Hanasand Mail

Standalone webmail for [mail.hanasand.com](https://mail.hanasand.com). The Hanasand dashboard at [hanasand.com/mail](https://hanasand.com/mail) uses the same UI package. Both browser clients call this repository's dedicated Mail API; mail requests do not pass through the Hanasand frontend or general-purpose API.

## Architecture

- `packages/mail-ui/` contains the shared React workspace, message reader, composer, mailbox controls, and API contract.
- `src/` contains the standalone Next.js app, sign-in page, and browser Mail API client.
- `api/` contains the dedicated Fastify Mail API. It validates sessions with Identity, reads the existing PostgreSQL account/mail data, and talks to Stalwart over the private mail network.
- `mail-server` runs Stalwart and the SMTP relay. It does not host the webmail interface or browser API.

The standalone host serves its own UI at `/`, same-origin sign-in proxies at `/api/auth/*`, and the Mail API at `/api/mail/*`. Identity serves the shared username/password, passkey, and SSO form and owns credential verification; Mail forwards those auth requests through its dedicated API and stores the resulting session cookies. The session lookup route `/api/auth/sessions` goes directly to Identity. The dashboard calls `https://mail.hanasand.com/api` directly from the browser. Identity validates the user's session for the dedicated Mail API. Identity and the existing account database remain shared dependencies; mail requests do not depend on the main Hanasand API or frontend.

`MAIL_USER_ALIASES` changes the Stalwart login name for a specific Identity user. `MAIL_USER_ADDRESSES` changes that user's primary sending address while preserving the previous address as an alias to the same mailbox. Use `user-id:address` entries separated by commas; deployment verifies each configured address before it switches traffic.

## Local development

Use Bun. Start the web app and API separately:

```sh
bun install
bun run dev
cd api && bun install && bun run dev
```

Set `NEXT_PUBLIC_MAIL_API_BASE` in `.env.local` to the API origin and path you want the browser to call. It defaults to `/api`; keep this same-origin for the standalone app so HttpOnly session cookies reach the Mail API. The dashboard uses its separate bearer-token client. The API settings are listed in [`api/.env.example`](api/.env.example); do not use production credentials in local development.

## Checks

```sh
bun run typecheck
bun run build
cd api && bun run typecheck && bun test
bash api/scripts/test-staging.sh
```

The staging command starts an isolated PostgreSQL-backed API with synthetic settings,
checks its health, unauthorized-request handling, and dashboard CORS, then removes the
temporary staging services and volume. It does not use production database or mail data.

To check device-bound sessions against real Identity and PostgreSQL, use a clean Git checkout on the staging Docker host and run `bash scripts/test-device-proof-staging.sh /path/to/identity-git-checkout`. The runner archives the reviewed Mail helper/test and pinned Identity revision from Git, uses the matching immutable Identity runtime dependencies, verifies an unused internal subnet, and creates a disposable database with synthetic credentials. It exercises proof binding, replay rejection, and lost-response handling without opening mailboxes or sending mail, then verifies that its containers and network are absent. Do not upload source archives manually; obtain both repositories through their configured Git remotes.

The Playwright suite creates accounts and sends mail. Run it only against an isolated test API and mail server, never against production mail data.

## Production

Push `main` to GitHub, update the clean checkout on the mail host, and run `scripts/deploy.sh`. The deployment builds candidate UI and API containers, checks their health and authentication behavior, provisions and verifies the shared mailboxes against the existing database and Stalwart accounts, switches the mail hostname routes, then verifies the public UI and API. Existing mailbox credentials are reused when they can be recovered; deployment stops without changing credentials if an existing account cannot be linked safely. The script keeps the previous UI/API route available for rollback.

For an API-only maintenance release, run `scripts/deploy.sh --api-only` from the same clean `main` checkout. This mode keeps the existing UI and skips mailbox provisioning. It retains the secret checks, shared deployment lock, API health, Identity, Stalwart, Browser, CORS, and OpenResty checks. Only the existing Mail API and auth upstreams switch to the candidate. The previous API container and the printed configuration backup remain available for rollback; failures restore the configuration automatically. The default command still provisions shared mailboxes and releases both UI and API.

The dedicated Mail API still relies on Identity, PostgreSQL, and Stalwart. Deploy Stalwart and the SMTP relay from the [mail-server repository](https://github.com/hanasandcom/mail-server).
