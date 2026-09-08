# Sendina HTTPS 443 mail migration audit

## Current state

- `server/mailproviders.ts` already sends Google mail through Gmail API and Microsoft mail through Microsoft Graph over HTTPS.
- SMTP/IMAP remains available for custom providers.
- OAuth refresh tokens and SMTP passwords are encrypted at rest via `server/secrets.ts`.
- The current send policy in `server/send.ts` already re-checks campaign state, emergency stop, suppression, replies, source verification, approval mode, readiness and daily domain quota per message.

## Gaps against the target architecture

1. Provider abstraction is still procedural rather than an explicit contract with capabilities.
2. OAuth applications can still fall back to account-level client credentials; the target state is platform-owned applications for Google and Microsoft.
3. OAuth state is held in an in-memory `Map`, so a backend restart invalidates an in-progress OAuth connection.
4. Incoming Google/Microsoft sync reads recent messages but has no persistent Gmail history cursor / Microsoft delta cursor.
5. Reply deduplication and restart recovery need durable provider message identity and cursor state.
6. Mailbox readiness is expressed through legacy four-check fields (`auth`, `testSend`, `imap`, `incoming`) instead of an explicit mailbox state machine and provider-specific blockers.
7. Gmail and Microsoft provider errors are not yet normalized into retryable/permanent/rate-limit/reauth classes, and retry/backoff is not centralized.
8. Microsoft `sendMail` currently returns no message id, which weakens post-send reconciliation.
9. Gmail RFC822 construction supports only plain text and does not yet expose Reply-To/HTML/thread metadata as a typed provider contract.
10. The previous restart behavior converted `sending` back to `draft`, which could resend a message when the provider accepted it but the backend crashed before persistence. This PR changes that first because it is the highest-risk correctness issue.

## Planned vertical slices

1. Restart-safe send idempotency / UNKNOWN state.
2. Explicit `MailProvider` contract, capabilities and normalized provider errors; adapt existing Google/Microsoft/SMTP code without changing policy behavior.
3. Platform-owned OAuth configuration and durable OAuth state; remove end-user client-id/client-secret path for Google/Microsoft.
4. Gmail provider hardening: MIME text+HTML, headers/thread metadata, account identity, history cursor and reply mapping.
5. Microsoft Graph provider hardening: identity, send/reconcile, delta cursor, thread/reply mapping.
6. Persistent inbound cursor/idempotency store plus recovery sync.
7. Mailbox state machine/readiness blockers and UI simplification.
8. Provider retries/backoff/Retry-After/observability and acceptance tests proving Google/Microsoft work with only outbound HTTPS 443.

Each slice must pass CI independently before merge.
