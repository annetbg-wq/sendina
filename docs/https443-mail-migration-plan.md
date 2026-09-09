# HTTPS 443 mail migration — completion checklist

The migration kept the existing campaign, policy, readiness and safety mechanisms in place while replacing the primary Google/Microsoft transport underneath them. Every production slice was developed on a feature branch, passed CI and was merged only when green.

- [x] **Restart-safe delivery state** — uncertain in-flight sends become `UNKNOWN`; quota and stable RFC Message-ID are retained; automatic resend is forbidden until provider evidence resolves the outcome.
- [x] **Provider runtime contract** — `MailProvider` owns capabilities, account identity, send, read, incremental sync, provider thread retrieval, delivery reconciliation and health checks. Business/orchestration code no longer selects Gmail/Graph/SMTP implementations itself.
- [x] **Production OAuth** — platform-owned Google/Microsoft apps, durable atomically single-use OAuth state, backend-only refresh tokens, encrypted storage, physical credential deletion on disconnect and `REAUTH_REQUIRED` classification.
- [x] **Gmail completeness** — Gmail API HTTPS send/read, RFC822 MIME text+HTML, Reply-To, stable RFC/provider/thread identity, Gmail History cursor, provider thread retrieval and reply mapping.
- [x] **Microsoft Graph completeness** — Graph HTTPS send/read, deterministic RFC Message-ID, Sent Items evidence reconciliation, conversation mapping/thread retrieval and durable Delta cursor.
- [x] **Inbound durability** — persistent cursor state, provider/RFC duplicate protection, transactional cursor advancement, bounded cursor reset and restart recovery.
- [x] **Automatic inbound recovery** — background recovery resumes connected approved-account mailboxes periodically; revoked/permanent failures are skipped until fixed; temporary failures retry on later cycles.
- [x] **Mailbox state machine/UI** — `DISCONNECTED`, `CONNECTING`, `READY`, `DEGRADED`, `REAUTH_REQUIRED`, `ERROR` with product actions and blockers. Legacy proof checks remain optional diagnostics.
- [x] **Reconnect generation safety** — a new OAuth/SMTP connection cannot inherit successful or failed proofs from an older credential generation.
- [x] **Resilience and observability** — normalized errors, bounded retry/backoff+jitter, `Retry-After`, correlation IDs and secret-safe provider logs/metrics.
- [x] **Safe UNKNOWN recovery** — Gmail/Graph UNKNOWN sends are reconciled by provider evidence only, manually or by the background worker; a miss remains UNKNOWN and never triggers resend.
- [x] **Legacy migration** — old per-account Google/Microsoft app values remain non-destructively readable for migration but are not exposed/accepted as active OAuth config. Existing custom SMTP/IMAP remains supported as an explicit advanced provider.
- [x] **443-only Google acceptance** — real Sendina API flow proves OAuth → verify → campaign send → durable History cursor → backend restart → reply mapping with TCP `465/587/993` blocked.
- [x] **443-only Microsoft acceptance** — equivalent Graph/Delta restart flow with the same blocked legacy ports.
- [x] **Revoked-token acceptance** — `READY → invalid_grant → REAUTH_REQUIRED → send blocked → new OAuth → CONNECTING → fresh verify → READY → send`.

## Deliberate non-goal for this migration

Provider push subscriptions are not required for correctness and are not advertised. `PUSH_NOTIFICATIONS` stays absent until Gmail watch / Microsoft Graph subscription creation, renewal, validation and webhook security are implemented. The implemented reliability mechanism is durable History/Delta cursors plus periodic recovery.

The authoritative acceptance matrix is `docs/https443-mail-migration-dod.md`.
