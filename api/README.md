# Mail API

This service owns the HTTP mail API used by the Mail web app. It calls Identity to
validate each user session and talks directly to Postgres and Stalwart. It does not
forward requests to the Hanasand application API.

## Local run

Use Bun 1.3 or newer. Copy `.env.example` to an untracked local env file, fill in the
service values, then run:

```sh
bun install
bun run dev
```

The process exits during startup if its required Identity, database, mail-key, or
Stalwart URL settings are missing. `GET /health` checks the database
connection. It does not expose account or mail data.

## HTTP contract

Routes are mounted under `/api`:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/auth/login` | Proxy username/password sign-in to Identity |
| `GET` | `/auth/passkeys/authenticate/options` | Proxy passkey request options to Identity |
| `POST` | `/auth/passkeys/authenticate/verify` | Proxy passkey verification to Identity |
| `GET` | `/auth/sso/start` | Start Identity SSO and forward its browser-binding cookie |
| `GET` | `/mail/overview` | Mailbox list, message page or selected message; accepts `mailboxUser`, `mailboxId`, `messageId`, `after`, and `unreadOnly` query values |
| `GET` | `/mail/search` | Search a mailbox; accepts `mailboxUser`, `mailboxId`, `query`, and `after` |
| `POST` | `/mail/send` | Send a message; requires an `Idempotency-Key` header |
| `POST` | `/mail/mailboxes` | Create a mailbox |
| `POST` | `/mail/message/:id/action` | Change message state, move, archive, junk, or trash |
| `GET` | `/mail/message/:id/reputation` | Check remote URL and attachment reputation |
| `POST` | `/mail/filters` | Create a mail filter |
| `DELETE` | `/mail/filters/:id` | Delete a mail filter |
| `GET` | `/mail/blob/:mailboxUser/:blobId/:name` | Fetch an attachment with safe content headers |
| `GET` | `/internal/support/mail/inbox` | Read a page of Support Inbox messages over the private service network |
| `POST` | `/internal/support/mail/send` | Send an idempotent Support reply over the private service network |

Identity owns password, passkey, and SSO verification. The Mail API exposes same-origin
proxy routes for those flows; it does not verify credentials or passkeys itself. The
Hanasand dashboard sends `Authorization: Bearer …` and `id`. The standalone Mail
site can use its same-origin `id` and HttpOnly `access_token` cookies when browser
JavaScript cannot read the token. Cookie authentication is accepted only on
`mail.hanasand.com` for same-origin requests; unsafe methods also require the exact
Mail origin. Both forms are validated through Identity's private session endpoint.
Rotated cookie sessions stay in a host-only `mail_access_token` HttpOnly cookie,
while bearer clients receive the existing refreshed-session headers. Mail does not
overwrite the shared `.hanasand.com` dashboard token. Cookie-authenticated requests
require the exact Mail Origin (or Fetch Metadata `same-origin` when Origin is absent);
this also protects overview GETs that can schedule mail rules from cross-origin calls.
Mail requests do not pass through the Hanasand frontend or its general-purpose API.

Mailbox access is limited to the signed-in user's own active personal mailbox. Active
internal editors can also access the explicitly shared mailboxes, but cannot open or
enumerate another user's personal mailbox. A `mailboxUser` value may therefore name
the signed-in user or an eligible shared mailbox only. Shared `noreply` send access
remains separately restricted. Mailbox credentials stay server-side and are decrypted
with the configured service key and compatibility keys.

## Runtime settings

`DATABASE_URL` must connect to the existing mail data store and provide the required
read access to user and organization membership records, plus mail account and mail
state tables. `HANASAND_IDENTITY_SERVICE_URL` must resolve only on the private service
network. `MAIL_API_CORS_ORIGINS` is an exact origin allowlist for `mail.hanasand.com`
and the Hanasand web app.

Set `MAIL_SERVICE_KEY` to the current encryption key. Keep `MAIL_SERVICE_KEY_PREVIOUS`
and any prior key material in the `MAIL_SERVICE_KEY_LEGACY_*` variables until existing
database ciphertext has been migrated. These values must match the raw key sources
used by the existing mail API; the service derives encryption keys from them the same
way. No secrets belong in this repository; `.env.example` contains empty placeholders
only.

`MAIL_SUPPORT_BRIDGE_KEY` is a separate 32-character-or-longer secret shared only
with Support. It protects the private Support inbox and reply routes; it does not
replace the encryption key or expose these routes through the public Mail proxy.

Mail reputation checks use the isolated managed browser service. Set
`BROWSER_REPUTATION_LOOKUP_URL` to the private Browser API endpoint and configure
`BROWSER_REPUTATION_LOOKUP_TOKEN` to match `BROWSER_MAIL_REPUTATION_TOKEN` in the
Browsers service. Mail sends only file SHA-256 hashes and canonical remote URLs; file
bytes remain in Mail. Results are cached in the Mail database. No VirusTotal API key is
used.

## Container

`Dockerfile` builds the API as a standalone Bun service. `compose.example.yml` binds it
to localhost for an existing reverse proxy and requires an existing internal Docker
network. Set `MAIL_API_IPV4_ADDRESS` to an unused, reserved address on that network so
each candidate keeps its source identity when Compose replaces it. Configure one
address for each API port, `MAIL_API_IPV4_ADDRESS_8085` and
`MAIL_API_IPV4_ADDRESS_8086`; the deploy script selects the address for its candidate
port. Route the public mail API hostname directly to this service; do not route it
through the Hanasand API or the Mail web app.
