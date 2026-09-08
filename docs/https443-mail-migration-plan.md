# HTTPS 443 mail migration slices

The migration is intentionally incremental. The existing campaign, policy, readiness and safety mechanisms stay in place while the mail transport is replaced underneath them.

1. **Restart-safe delivery state** — preserve uncertain in-flight sends as `unknown`; never silently retry them.
2. **Provider contract** — introduce typed capabilities, send/read/thread/identity/health operations and normalized provider errors; wrap the existing Gmail API, Microsoft Graph and SMTP/IMAP implementations.
3. **Production OAuth** — platform-owned Google/Microsoft applications, durable OAuth state, backend-only refresh, revoke/disconnect and reauth classification.
4. **Gmail inbound/outbound completeness** — MIME text/HTML, Reply-To, stable message/thread metadata, account identity, Gmail history cursor and reply mapping.
5. **Microsoft Graph completeness** — message identity/reconciliation, conversation mapping and durable delta cursor.
6. **Inbound durability** — persistent cursors, duplicate event protection and restart recovery for replies.
7. **Mailbox state machine/UI** — `DISCONNECTED`, `CONNECTING`, `READY`, `DEGRADED`, `REAUTH_REQUIRED`, `ERROR` with actionable blockers and simple connection UI.
8. **Resilience and observability** — retry classification, exponential backoff+jitter, `Retry-After`, correlation IDs and credential-safe logs.
9. **443-only acceptance gate** — tests/stubs prove Google and Microsoft connect/send/read/reply/recover with SMTP/IMAP ports unavailable.
