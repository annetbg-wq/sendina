# Sendina HTTPS 443 mailbox migration — Definition of Done

This document is the acceptance contract for the migration whose goal was to make Google Workspace and Microsoft 365 fully usable when the hosting provider permits ordinary outbound HTTPS but blocks traditional SMTP/IMAP ports.

## 1. Transport architecture

| Requirement | Status | Implementation / evidence |
|---|---|---|
| Google primary path does not require SMTP/IMAP | ✅ | Gmail API through `server/mailproviders.ts`; `tests/https443e2e.test.ts`, `tests/https443gate.test.ts` actively block `465/587/993`. |
| Microsoft primary path does not require SMTP/IMAP | ✅ | Microsoft Graph through `server/mailproviders.ts`; `tests/https443microsoft.e2e.test.ts`, `tests/https443gate.test.ts`. |
| Custom providers may still use SMTP/IMAP | ✅ | Explicit `smtp` provider remains behind `MailProvider`; UI exposes it only as custom/advanced mode. |
| Business logic is provider-neutral | ✅ | `server/mailcontract.ts` is the runtime boundary used by mailbox orchestration, campaign send and UNKNOWN recovery. |
| Provider capabilities are honest | ✅ | Google/Microsoft: SEND, READ, THREADS, REPLY_DETECTION. Custom SMTP: SEND, READ, REPLY_DETECTION. PUSH_NOTIFICATIONS is not advertised. |

## 2. OAuth and secrets

| Requirement | Status | Implementation / evidence |
|---|---|---|
| Platform-owned Google/Microsoft OAuth applications | ✅ | `server/platform.ts`; account-level legacy app credentials are ignored by resolver. |
| Ordinary users never configure Client ID/Secret | ✅ | mailbox UI uses Connect Google/Microsoft; ordinary account settings no longer expose or accept legacy mail-app credentials. |
| Durable, high-entropy, expiring OAuth state | ✅ | `server/oauthstate.ts`, persistent `auth_store`, `tests/oauthstate.test.ts`. |
| OAuth state cannot be replayed/concurrently consumed twice | ✅ | atomic `takeAuth`; concurrency test in `tests/oauthstate.test.ts`. |
| Refresh token stays backend-only and encrypted at rest | ✅ | `server/secrets.ts`, `server/authstore.ts`; connection tests verify refresh token is absent from public state and stored encrypted. |
| Disconnect removes stored credential | ✅ | `setAuth(key,null)` physically deletes the auth-store key; `tests/mailboxmigration.test.ts`. |
| Revoked token becomes REAUTH_REQUIRED | ✅ | normalized `invalid_grant`, persisted mailbox provider health, product state/action and full `tests/revokedreauth.e2e.test.ts`. |

## 3. Sending and idempotency

| Requirement | Status | Implementation / evidence |
|---|---|---|
| Text and HTML MIME | ✅ | `server/mime.ts`, Gmail/Graph RFC822 paths; `tests/mime.test.ts`, `tests/gmailsend.test.ts`. |
| Reply-To and standard RFC threading headers | ✅ | MIME builder supports Reply-To, Message-ID, In-Reply-To, References; provider thread IDs are stored separately. |
| Stable RFC Message-ID exists before network request | ✅ | reserved in `server/send.ts` before provider call; `tests/sendunknown.test.ts`. |
| Delivery states distinguish queued/in-flight/sent/failed/unknown | ✅ | persisted `deliveryState`; restart normalization preserves UNKNOWN. |
| Ambiguous send is never silently resent | ✅ | retry policy does not repeat ambiguous 5xx/socket send; `UNKNOWN` is blocked by `reserve()`. |
| Definite provider rejection may safely return to retryable draft state | ✅ | settlement returns quota only for proved failure. |
| Graph 202 can be reconciled without Mail.ReadWrite | ✅ | deterministic RFC Message-ID + Sent Items lookup via Mail.Read. |
| Gmail UNKNOWN can be reconciled safely | ✅ | SENT search by RFC Message-ID followed by metadata evidence. |
| UNKNOWN reconciliation is idempotent | ✅ | evidence application increments campaign sent count once; repeated evidence is no-op. |
| Background UNKNOWN reconciliation never resends | ✅ | periodic worker calls evidence-only recovery; a miss remains UNKNOWN. |

## 4. Incoming replies, threads and restart recovery

| Requirement | Status | Implementation / evidence |
|---|---|---|
| Gmail incoming over HTTPS | ✅ | Gmail API full-message mapping. |
| Microsoft incoming over HTTPS | ✅ | Graph message mapping. |
| Gmail durable incremental cursor | ✅ | History ID persisted as opaque cursor; expired history falls back to bounded baseline. |
| Microsoft durable incremental cursor | ✅ | Graph deltaLink persisted opaque; 410 resets through bounded delta baseline. |
| Cursor and imported replies survive backend restart | ✅ | workspace persistence + Google/Microsoft restart acceptance tests. |
| Cursor does not advance before reply mutation commits | ✅ | provider batch is read first, then replies/cursor are committed in the same workspace mutation. |
| Duplicate provider events are harmless | ✅ | provider ID + RFC Message-ID dedupe; repeated sync acceptance assertions. |
| Reply maps to original recipient/campaign | ✅ | contact/message lookup in sync pipeline; Google/Microsoft end-to-end tests. |
| Thread/conversation identity is retained | ✅ | Gmail threadId / Graph conversationId stored on incoming/outgoing events. |
| Real provider thread can be retrieved through common contract | ✅ | `MailProvider.getThread`; Gmail thread API / Graph conversation query; `tests/mailthread.test.ts`. |
| Replies arrive without a manual sync button | ✅ | periodic mailbox recovery worker, default five minutes. |

## 5. Mailbox state and recovery

Product states are exactly:

`DISCONNECTED → CONNECTING → READY`, with runtime failure states `DEGRADED`, `REAUTH_REQUIRED`, `ERROR`.

- The product UI reads the server-side state/action as its primary truth.
- The old four proof checks remain diagnostic evidence rather than the primary user model.
- Provider errors gate the same readiness used by UI, capabilities, sender selection and real campaign send.
- A new OAuth/SMTP connection creates a new proof generation. Proof timestamps older than `connectedAt` cannot authorise the new credential.
- A fresh OAuth connection retires the old revoked-token provider failure, but remains CONNECTING until fresh auth/send/incoming-channel/incoming-message proofs pass.
- Temporary/rate-limit failures are DEGRADED and recoverable; permanent failures become ERROR; revoked OAuth requires explicit reauthentication.

Evidence: `tests/mailboxstate.test.ts`, `tests/providerhealthreadiness.test.ts`, `tests/mailboxprooffreshness.test.ts`, `tests/revokedreauth.e2e.test.ts`.

## 6. Rate limits, retries and observability

- Provider errors are normalized as `REAUTH_REQUIRED`, `RATE_LIMITED`, `RETRYABLE`, `PERMANENT`, `UNKNOWN`.
- Safe reads/token refreshes use bounded exponential backoff with jitter.
- `Retry-After` is honored.
- Explicit 429 send rejection may be retried because the provider proved it did not accept the request.
- Ambiguous 5xx/socket send is not automatically repeated.
- Every provider operation gets a correlation ID and aggregate metrics.
- Logs deliberately omit token/credential values, request bodies, sensitive headers and URL query contents.

Evidence: `tests/providererrors.test.ts`, `tests/providerrequest.test.ts`, `tests/providerobservability.test.ts`.

## 7. Existing Sendina safeguards preserved

The transport migration does **not** bypass or replace the existing send policy. The real send boundary still re-evaluates, per message:

- deployment sending switch;
- emergency stop;
- campaign state;
- global suppression;
- existing replies;
- verified recipient source and contact reason;
- duplicate recipient detection;
- campaign control / first-batch approval;
- current mailbox/domain readiness;
- daily domain quota;
- controlled test allowlist.

Evidence: `server/send.ts`, `tests/send.test.ts`, `tests/livesend.test.ts`, policy tests and the HTTPS end-to-end flows.

## 8. Migration behavior

- Existing custom SMTP/IMAP connections remain supported.
- Existing workspace rows are normalized in place; there is no destructive reset of campaigns, contacts or replies.
- Disconnected legacy mailbox rows have stale proofs/cursors/provider errors cleared before future reconnect.
- Legacy per-account Google/Microsoft OAuth app credentials remain internally readable so old data is not destructively erased, but cannot be used by the production resolver or ordinary settings endpoint.
- A successful Google/Microsoft platform OAuth connection becomes the primary API connection.

## 9. Acceptance gates

The migration is accepted only while all CI remains green, including these high-value gates:

1. `tests/https443gate.test.ts` — both primary providers send and read with TCP `465/587/993` blocked.
2. `tests/https443e2e.test.ts` — Google OAuth → verify → campaign send → History cursor → restart → reply mapping → dedupe.
3. `tests/https443microsoft.e2e.test.ts` — Microsoft equivalent using Graph Delta.
4. `tests/revokedreauth.e2e.test.ts` — revoked token blocks sending, new OAuth requires fresh proofs and restores READY safely.
5. `tests/idempotency.test.ts` / `tests/sendunknown.test.ts` / reconciliation tests — no duplicate send after uncertain delivery or restart.

No CI test uses real Google/Microsoft credentials.

## 10. Explicit future optimization, not migration debt

Gmail watch and Microsoft Graph webhook subscriptions are **not** implemented in this migration. They require subscription creation, renewal, webhook validation/security and operational monitoring. The product does not advertise `PUSH_NOTIFICATIONS`.

This does not leave reply correctness dependent on manual action: durable provider cursors plus the periodic background recovery worker are the implemented recovery mechanism. Push can later reduce latency without changing the storage/idempotency model.
