# HUD OAS Platform — Security Audit (2026-06-11)

Audit of the **deployed** dev system (`hsg-hudoas-dev`, us-east-1) against the OAS configuration spec's security requirements and HUD Handbook 2400.25 posture. Method: live AWS inspection, per-handler authorization review, sealed-bid confidentiality tracing, and a client-surface + secrets sweep. This is a dev-stage system; the bar here is "credible, demoable security posture with a clean path to ATO," not full FedRAMP authorization.

## Verdict

**The core security model is sound and, in the areas that matter most for a sealed-bid platform, genuinely strong.** Encryption, key management, transport security, identity, token handling, and — critically — the read-side data scoping that keeps one bidder from seeing another's bids or the confidential reserves are all correctly implemented and verified live. The gaps are real but bounded: one confidentiality bug (the loan tape isn't behind the qualification gate), MFA is optional rather than enforced, and the production-hardening layer (WAF, security headers, CloudTrail, alerting) is not yet stood up. None of the gaps is a secret leak or an open door to the data; they are tightening and hardening items, and two of them I fixed in this pass.

---

## What's already correct (verified live)

**Encryption & keys**
- Customer-managed KMS CMK with **automatic key rotation on**; all 11 DynamoDB tables and both S3 buckets encrypted with it.
- KMS key policy is scoped — account-conditioned and restricted to `kms:ViaService` ∈ {dynamodb, s3}, not a blanket grant.

**Storage**
- Both S3 buckets have the **full four-way public-access block** on. Docs bucket additionally **denies all non-TLS** requests by policy. Static bucket is **locked to the CloudFront distribution by Origin Access Control** — it cannot be read directly.
- **Point-in-time recovery is ON for all 11 tables.**

**Transport**
- CloudFront forces **redirect-to-HTTPS**, **TLS 1.2_2021 minimum**, API behavior is **https-only**.

**Identity & tokens**
- Password policy: **12-char minimum** with upper/lower/number/symbol required.
- **Self-signup disabled** (admin-create-only) — no anonymous account creation.
- Access & ID tokens **expire in 60 minutes**; refresh 30 days; **token revocation enabled**; **`PreventUserExistenceErrors` ON** (no account enumeration).
- JWT authorizer validates **both issuer and audience** (audience bound to this app's client) and is the **DefaultAuthorizer** on every route.

**Authorization & confidentiality (the heart of it)**
- Every route requires a valid JWT **except two intentional anonymous flows**: `POST /bidders` (a prospect must be able to apply before they have an account) and the three `/screenings/*` endpoints (pre-account OFAC/SAM/TIN).
- Read-side scoping is correct and verified:
  - Bids are queried **by the caller's own bidderId**; cross-portal reads filtered.
  - Confidential **reserve / floor / BEM fields and the unearned completion CODE are stripped** from every bidder-facing sale/pool response (re-confirmed live in this audit).
  - Notifications scoped **by recipient**; Q&A shows **only the bidder's own questions plus published answers**; `bidders/get` is **self-or-admin only**.
  - VDR document list and download **require `Qualified` status and an open VDR sale-state**.
  - Bid submission re-derives every dollar amount **server-side** and rejects client-supplied figures.

**Code hygiene**
- **No secrets in source and none in git history** (scanned all refs). Client `config.js` holds only public identifiers (Cognito pool/client IDs, API base) — these are not secrets.
- User-supplied fields (bidder names, Q&A text) are rendered through an `esc()` HTML-escaper in every render module.

---

## Findings

### P1 — fix before HUD sees it

**S-1 · Loan tape is not behind the qualification gate** — *FIXED in this pass.*
`GET /sales/{id}/loans` and `GET /loans/{saleId}/{loanId}` checked portal scope only, not `Qualified` status — while the VDR documents beside them correctly required qualification. A registered-but-unqualified, portal-matched user could pull the full per-loan financial tape (UPB, BPO, DSCR, financials). This contradicts QL-03 ("unqualified visitors see summary marketing only"). Fix mirrors the `docs/list` gate: both handlers now require `Qualified` + an open data-room sale-state for non-admins.

**S-2 · No security response headers** — *FIXED in this pass.*
The distribution served no HSTS, CSP, X-Frame-Options, X-Content-Type-Options, or Referrer-Policy (the attached policy was a CORS policy). Added a CloudFront **ResponseHeadersPolicy** to the template (HSTS 2 yr + preload, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a baseline CSP, and `Permissions-Policy`) attached to both the default and `/api/*` behaviors. Deploys with the backend.

**S-3 · MFA is OPTIONAL, not enforced.**
The pool is `MfaConfiguration: OPTIONAL` — a user can decline TOTP. The spec and the rebuild plan call for MFA enforced (NIST AAL2). The frontend already has the full TOTP setup + challenge flow, so the client can handle a forced challenge. **Recommended:** flip the pool to `MfaConfiguration: ON` (one template line). Held back from flipping it unilaterally because it forces every existing user — including the live admin and demo logins — into enrollment at next sign-in; worth doing deliberately, not mid-audit. One-line change + a re-login of the admin account.

**S-4 · No WAF on the distribution.**
`WebACLId` is empty. The two anonymous endpoints (bidder-create, screening) have no rate limiting or bot/abuse protection, and there are no managed rule sets (OWASP common, known-bad-inputs, SQLi). **Recommended (Phase 6):** AWS WAF web ACL with `AWSManagedRulesCommonRuleSet` + `KnownBadInputs` + a rate-based rule (e.g. 100 req/min/IP) on the anonymous paths. ~$5–15/mo.

### P2 — before production / part of the ATO path

**S-5 · Per-bidder watermarking is deferred.** `presignDownload` serves the *original* document; the per-bidder diagonal watermark (VD-04) is stubbed for "future iteration." A generic upload-time "CONFIDENTIAL" stamp exists, but downloads are not yet traceable to the individual bidder. Access **is** logged per bidder (IP, UA, timestamp), so attribution exists in the log even though it's not burned into the PDF.

**S-6 · No CloudTrail trail** in this account/region. API-call audit history (2400.25 AU family) isn't being captured at the platform level. **Recommended:** a multi-region trail to an Object-Lock S3 bucket. (An org-level trail may exist outside this stack — confirm.)

**S-7 · No CloudWatch alarms.** No alerting on Lambda errors, 4xx/5xx spikes, or throttles — a bid-day outage would be discovered by users first. **Recommended:** alarms on the bid-window-critical functions + an SNS topic.

**S-8 · Cognito advanced security is OFF.** No compromised-credential detection or adaptive auth. **Recommended:** enable `UserPoolAddOns: ENFORCED` (note: paid tier).

**S-9 · SES sender domain not verified.** The `hudloansales` identity shows empty verification attributes; DKIM/SPF aren't proven, and `ses.mjs` swallows send failures (logs, doesn't throw). Confidential **bid receipts and the completion CODE go out by email** — a silent delivery failure means a bidder thinks their bid didn't land. **Recommended:** verify the domain (DKIM CNAMEs at GoDaddy) before relying on receipt emails; consider surfacing send failures to the bidder in-app.

### P3 — advisory / longer-horizon
- **Lambda runtime `nodejs20.x` is deprecated** (creation disabled 2026-06-01; **updates disabled 2026-07-01**). All 38 functions are on it. Bump `Globals.Function.Runtime` to `nodejs24.x` before the July cutoff — a one-line change, but it touches every function so it gets its own deploy + smoke pass.
- Account-level S3 public-access block isn't set (bucket-level blocks already cover these buckets — defense-in-depth only).
- IAM `Resource: '*'` appears on `ses:SendEmail` grants (SES doesn't support resource-level send scoping well) and the account-root KMS statement (standard). Acceptable; revisit SES with a configuration-set/identity ARN at prod.
- Access log is in DynamoDB (append-only by convention) but not cryptographically immutable (QLDB/Object-Lock) — fine for dev; an ATO item.
- Idle/absolute session timeout is enforced only by token lifetime (60 min), not an explicit idle timer.

---

## Mapping to the standards

| Area | Spec / 2400.25 expectation | Status |
|---|---|---|
| Encryption at rest | KMS CMK, rotation | ✅ |
| Encryption in transit | TLS 1.2+, HTTPS-only | ✅ |
| Sealed-bid confidentiality | reserves/BEM/other bids never to bidders | ✅ verified |
| Qualification gating | unqualified see marketing only | ✅ after S-1 fix |
| AuthN | strong password, no enumeration, no self-signup | ✅ |
| MFA (AAL2) | enforced | ⚠️ optional (S-3) |
| AuthZ on every endpoint | JWT + scope | ✅ (2 intended anon flows) |
| Audit logging | API + access trail | ⚠️ access-log ✅, CloudTrail ✗ (S-6) |
| Edge protection | WAF, rate limit, headers | ⚠️ headers fixed (S-2), WAF pending (S-4) |
| Monitoring/alerting | error + anomaly alarms | ✗ (S-7) |
| Document traceability | per-bidder watermark | ⚠️ logged, not burned-in (S-5) |
| Secrets management | none in code | ✅ |

---

## What I changed in this pass
1. **S-1** — added the `Qualified` + open-data-room gate to `sales/loans.mjs` and `loans/get.mjs`.
2. **S-2** — added a security-headers `ResponseHeadersPolicy` to `template.yaml`, attached to the default and API cache behaviors.

Both deploy with the next backend deploy. Everything else above is a ranked recommendation, not yet applied.
