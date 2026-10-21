# `@hanasand/mail-ui`

Shared React workspace for the standalone mail app and the native Hanasand dashboard. Keep layout, mailbox selection, message list, reader, composer, and admin controls here so both surfaces render the same interface.

Each host supplies a `MailUiApi` implementation through `MailUiApiProvider`. The package owns presentation and interaction state; it does not choose a server, keep credentials, or proxy requests. The standalone adapter calls its same-origin Mail API. The dashboard adapter calls the dedicated Mail API host directly.

Both Next.js apps transpile this package and include its `src/` directory in Tailwind's source scan. Host apps provide the shared UI color tokens.
