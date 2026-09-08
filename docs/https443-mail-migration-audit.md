# Sendina HTTPS 443 mail migration audit

> **Status: historical baseline.** This document records the gaps that existed when the HTTPS 443 migration began. Those gaps have now been closed by the migration slices and acceptance gates. The current completion contract lives in `docs/https443-mail-migration-dod.md`.

## Baseline that triggered the migration

At the start:

- Gmail API and Microsoft Graph transports existed, but business/orchestration code still knew too much about individual providers.
- SMTP/IMAP was still entangled with ordinary Google/Microsoft connection UX.
- OAuth state was not restart-safe.
- Google/Microsoft incoming sync had no durable History/Delta recovery cursor.
- provider message/thread identity and duplicate protection were incomplete.
- mailbox readiness was primarily a four-check implementation detail rather than a product state machine.
- provider errors/retries were not normalized centrally.
- an in-flight send could be normalized back to `draft` after restart, creating duplicate-send risk.

The existing campaign policy itself was already valuable and was intentionally preserved: campaign state, emergency stop, suppression, existing replies, verified source, approval/control mode, mailbox/domain readiness and daily domain quota are still re-evaluated per message at the real send boundary.

## Closure of the original gaps

1. **Provider abstraction** — closed. `MailProvider` is the runtime boundary for send, read, incremental sync, health, reconciliation, account identity and provider threads. Gmail/Graph/custom SMTP details live behind it.
2. **Platform OAuth ownership** — closed. Google/Microsoft applications are platform-owned; legacy per-account OAuth app fields are migration-only data and are neither exposed nor accepted by the ordinary settings API.
3. **Restart-safe OAuth state** — closed. OAuth state is persistent, high-entropy, expiring and atomically single-use.
4. **Durable inbound cursor** — closed. Gmail History and Microsoft Graph Delta cursors are persisted with the workspace and resume after restart; expired cursors have bounded recovery behavior.
5. **Reply identity/deduplication** — closed. Provider message/thread IDs and RFC Message-ID are stored separately; repeated events are idempotent and replies map back to campaigns/contacts.
6. **Mailbox state machine** — closed. Product states are `DISCONNECTED`, `CONNECTING`, `READY`, `DEGRADED`, `REAUTH_REQUIRED`, `ERROR`; the legacy proof checks remain only as diagnostic evidence.
7. **Provider resilience** — closed. Errors are classified into reauth/rate-limit/retryable/permanent/unknown classes; safe reads retry with bounded exponential backoff+jitter and `Retry-After`; ambiguous sends are not blindly retried.
8. **Microsoft send reconciliation** — closed. Graph `202 Accepted` is correlated by a deterministic RFC Message-ID and reconciled against Sent Items without adding `Mail.ReadWrite` or resending.
9. **MIME/thread metadata** — closed. Gmail/Graph use RFC822 MIME with text/HTML, Reply-To and stable message/thread metadata; provider thread retrieval is exposed through the common contract.
10. **Restart duplicate risk** — closed. `SENDING` normalizes to `UNKNOWN`, retains its quota reservation and reconciliation key, and cannot be automatically resent until provider evidence resolves it.

## Additional hardening completed

- Google/Microsoft end-to-end acceptance gates actively block TCP `465/587/993` while exercising OAuth, verify, campaign send, inbound reply mapping and backend restart recovery.
- revoked OAuth token has a full end-to-end flow: `READY → REAUTH_REQUIRED → sending blocked → OAuth reconnect → CONNECTING → fresh verification → READY`.
- a reconnect creates a new proof generation: successful/failed proofs from an older credential cannot authorize the new credential.
- disconnect physically deletes stored mailbox credentials and clears stale runtime proof/cursor/provider-error state.
- periodic background recovery resumes Gmail History / Graph Delta automatically and also performs evidence-only reconciliation of eligible `UNKNOWN` sends. It never resends an uncertain message.
- provider observability is correlation-ID based and deliberately excludes credentials, request bodies, provider headers and sensitive URL query strings.

## Deliberately not claimed

`PUSH_NOTIFICATIONS` is **not** advertised. Gmail watch / Microsoft Graph subscription lifecycle is optional future optimization, not a correctness dependency. Durable cursors plus periodic recovery are the implemented reliability layer.

SMTP/IMAP remains supported only as an explicit custom/advanced provider. The primary Google/Microsoft path is HTTPS API over outbound 443.
