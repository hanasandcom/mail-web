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
| `GET` | `/mail/overview` | Mailbox list, message page or selected message; accepts `mailboxUser`, `mailboxId`, `messageId`, `after`, and `unreadOnly` query values |
| `GET` | `/mail/search` | Search a mailbox; accepts `mailboxUser`, `mailboxId`, `query`, and `after` |
| `POST` | `/mail/send` | Send a message; requires an `Idempotency-Key` header |
| `POST` | `/mail/mailboxes` | Create a mailbox |
| `POST` | `/mail/message/:id/action` | Change message state, move, archive, junk, or trash |
| `GET` | `/mail/message/:id/reputation` | Check remote URL and attachment reputation |
| `POST` | `/mail/filters` | Create a mail filter |
| `DELETE` | `/mail/filters/:id` | Delete a mail filter |
| `GET` | `/mail/blob/:mailboxUser/:blobId/:name` | Fetch an attachment with safe content headers |

The browser sends `Authorization: Bearer …` and `id`. This service validates the
session through Identity's private session endpoint and returns refreshed session
headers when needed. Mail requests do not pass through the Hanasand frontend or its
general-purpose API.

Mailbox access follows the existing Hanasand mail policy: a user can open their own
active mailbox; active internal editors can access eligible user and shared mailboxes.
Shared `noreply` send access remains separately restricted. Mailbox credentials stay
server-side and are decrypted with the configured service key and compatibility keys.

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

## Container

`Dockerfile` builds the API as a standalone Bun service. `compose.example.yml` binds it
to localhost for an existing reverse proxy and requires an existing internal Docker
network. Set `MAIL_API_IPV4_ADDRESS` to an unused, reserved address on that network so
each candidate keeps its source identity when Compose replaces it. Configure one
address for each API port, `MAIL_API_IPV4_ADDRESS_8085` and
`MAIL_API_IPV4_ADDRESS_8086`; the deploy script selects the address for its candidate
port. Route the public mail API hostname directly to this service; do not route it
through the Hanasand API or the Mail web app.
