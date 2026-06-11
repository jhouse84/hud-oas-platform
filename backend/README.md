# HSG HUD OAS Platform — Backend

Serverless backend for the HUD Office of Asset Sales Transaction Platform, owned and operated by **House Strategies Group LLC** (HSG).

- **Stack**: AWS SAM (CloudFormation) · API Gateway HTTP API · Lambda (Node 20 / arm64) · DynamoDB on-demand · S3 (VDR with KMS) · Cognito · SES · CloudFront
- **Region**: `us-east-1`
- **Stages**: `dev` · `staging` · `prod`
- **Account strategy**: isolated resources within existing AWS account, naming prefix `hsg-<stage>-*`, tag `Project=HUD-OAS-Platform`
- **Custom domain**: `hudloansales.housestrategiesgroup.com` (prod) · `dev-hudloansales.housestrategiesgroup.com` (dev)

---

## Prerequisites

| Tool | Install |
|---|---|
| Node 20+ | `node --version` (installed) |
| Python 3.9+ | `python --version` (installed) |
| AWS CLI v2 | `winget install -e --id Amazon.AWSCLI` |
| AWS SAM CLI | `winget install -e --id Amazon.SAM-CLI` |
| Docker Desktop | Only required for `sam build --use-container` (we default off) |

Open a fresh terminal after install so the new PATH is picked up.

---

## One-time AWS setup

### 1. Configure a named CLI profile

> Never commit access keys. Prefer AWS SSO or short-lived IAM user credentials.

```bash
aws configure --profile hsg-hudoas
# AWS Access Key ID      : <from IAM console or SSO>
# AWS Secret Access Key  : <...>
# Default region name    : us-east-1
# Default output format  : json
```

Then in every terminal that deploys:
```bash
export AWS_PROFILE=hsg-hudoas
```
(On PowerShell: `$env:AWS_PROFILE = 'hsg-hudoas'`)

Verify:
```bash
aws sts get-caller-identity
```

### 2. Create or confirm the Route53 hosted zone for `housestrategiesgroup.com`

If the zone already exists in this AWS account, capture its hosted zone ID:
```bash
aws route53 list-hosted-zones-by-name --dns-name housestrategiesgroup.com --query 'HostedZones[0].[Id,Name]'
```
If it lives in a different account or registrar, delegate `hudloansales.housestrategiesgroup.com` to this account by creating 4 NS records at the parent.

### 3. Request the ACM certificate (or let the stack do it)

By default, `template.yaml` creates the ACM cert for you via DNS validation. If you already have one in `us-east-1`, pass its ARN:
```
--parameter-overrides CertificateArn=arn:aws:acm:us-east-1:xxxx:certificate/abc-123
```

### 4. SES domain verification

The stack provisions an `AWS::SES::EmailIdentity` for the domain. After first deploy:
- Grab the three DKIM CNAME records from the SES console (Domains → hudloansales.housestrategiesgroup.com)
- Add them to Route53 (or let SES auto-publish if the zone is in the same account)
- Allow up to 72 hours for verification
- **Initially SES is in sandbox mode** — it can only send to verified addresses. Request production access via the SES console once you're ready to email real bidders.

---

## Install + deploy

```bash
cd backend
npm install
sam build
sam deploy --config-env dev --guided   # first deploy only — choose defaults
```

Subsequent deploys:
```bash
sam build && sam deploy --config-env dev
```

### What you get

Outputs printed after `sam deploy`:

| Output | Use |
|---|---|
| `ApiEndpoint` | Direct Lambda/API Gateway URL (pre-CloudFront) |
| `CustomDomain` | Production URL behind CloudFront + WAF |
| `UserPoolId` / `UserPoolClientId` | Paste into `frontend/shared/config.js` |
| `DocsBucket` | VDR bucket name (for CLI uploads during testing) |
| `StaticBucket` | Frontend static bucket |

### Wire the frontend

After deploy, create `platform/shared/config.js` with:
```js
window.HSG_CONFIG = {
  apiBase: 'https://<CustomDomain>/api',
  userPoolId: '<UserPoolId>',
  userPoolClientId: '<UserPoolClientId>',
  region: 'us-east-1'
};
```
Reference it in the HTML before `shared/api.js`:
```html
<script src="shared/config.js"></script>
<script src="shared/api.js"></script>
```

Then in the UI, call `HSG.api.enableLive()` after the first successful Cognito login. Until that call, the UI runs on localStorage (useful for offline demos).

### Upload frontend assets

```bash
aws s3 sync ../ s3://<StaticBucket>/ \
  --exclude "backend/*" --exclude "*.md" --exclude ".git/*" --exclude "data/*" \
  --cache-control "public, max-age=300"
aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths "/*"
```

---

## API surface

All endpoints are under `https://<domain>/api/` when fronted by CloudFront, or `https://<api-id>.execute-api.us-east-1.amazonaws.com/dev/` direct. All require `Authorization: Bearer <IdToken>` except where noted.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/bidders` | **Public** | Submit qualification application |
| GET | `/bidders` | Cognito | List bidders (admin sees all, bidders see own) |
| GET | `/bidders/{bidderId}` | Cognito | Get one bidder |
| POST | `/bidders/{bidderId}/approve` | Admin | Approve a pending application |
| POST | `/bidders/{bidderId}/reject` | Admin | Decline an application |
| POST | `/bidders/{bidderId}/request-info` | Admin | Request additional information |
| GET | `/sales/{saleId}/docs` | Cognito | List VDR docs for a sale |
| POST | `/docs/presign-download` | Cognito | Presigned URL to download (logs access) |
| POST | `/docs/presign-upload` | Admin | Presigned URL to upload original (triggers watermark) |
| POST | `/access-log` | Cognito | Explicit access log entry |
| POST | `/bids` | Cognito | Submit a bid |
| GET | `/bids?saleId=…` or `?bidderId=…` | Cognito | List bids |
| POST | `/sales/{saleId}/qa` | Cognito | Ask a Q&A question |
| POST | `/qa/{qaId}/answer` | Admin | Answer a pending question |
| GET | `/sales/{saleId}/qa` | Cognito | List Q&A (bidders see own + public answered) |

### Cost estimate (dev traffic)

| Service | Monthly est. |
|---|---|
| DynamoDB on-demand | $5–10 |
| Lambda (all handlers) | $2–5 |
| API Gateway HTTP API | $3–5 |
| S3 (VDR + static, light traffic) | $2–5 |
| CloudFront (PriceClass_100) | $5–10 |
| Cognito (up to 50k MAU free) | $0 |
| Route53 hosted zone | $0.50 |
| KMS customer-managed key | $1 |
| CloudWatch Logs (with 30-day retention) | $3–8 |
| **Total** | **~$25–45 / mo** |

Prod traffic with WAF + GuardDuty could add $20–40 more.

---

## Operations

### Tail logs for a single function
```bash
sam logs --name FnBiddersCreate --stack-name hsg-hudoas-dev --tail
```

### Query DynamoDB directly
```bash
aws dynamodb scan --table-name hsg-dev-bidders --limit 5
```

### Rotate KMS key
Customer-managed KMS keys auto-rotate annually (`EnableKeyRotation: true`). No manual action needed.

### Delete a stage (careful — tables + buckets are Retained)
```bash
sam delete --stack-name hsg-hudoas-dev
# DeletionPolicy: Retain means DynamoDB tables, S3 buckets, KMS key, Cognito pool survive.
# To fully clean up, delete them manually after confirming they're empty.
```

---

## Security posture (maps to HUD Handbook 2400.25)

| Control family (2400.25 / NIST 800-53) | Implementation |
|---|---|
| AC — Access Control | Cognito user pool groups (admin/bidder), IAM least-privilege per Lambda, S3 bucket policies deny non-TLS + public |
| AU — Audit & Accountability | Append-only `access-log` table with IP + user agent, CloudTrail enabled at account level, Lambda structured JSON logs |
| SC — System & Comms Protection | TLS 1.2+ enforced, SSE-KMS on S3 + DynamoDB, KMS CMK with annual rotation, CloudFront managed security headers policy |
| IA — Identification & Auth | MFA (SOFTWARE_TOKEN_MFA) optional, password policy: 12+ chars with 4 character classes, token revocation enabled |
| CP — Contingency Planning | DynamoDB PITR (35-day), S3 versioning, multi-AZ redundancy by default |
| CM — Configuration Mgmt | All infra via SAM/CloudFormation — reviewable, diff-able, version-controlled |
| SI — System & Information Integrity | Input validation at every handler entry, structured error responses, no secret leakage in logs |

Documented in the Contractor IT Security Plan (`plans/contractor-it-security-plan.md` — to be drafted).

---

## Runbook — first deploy

1. `npm install` in `backend/`
2. `aws configure --profile hsg-hudoas` (region `us-east-1`)
3. `export AWS_PROFILE=hsg-hudoas`
4. `sam build`
5. `sam deploy --config-env dev --guided` — accept defaults; note the outputs
6. Add the three SES DKIM CNAMEs to Route53 (check SES console)
7. Log into the Cognito-sent email → set permanent password for admin account
8. `aws s3 sync ../ s3://<StaticBucket>/ --exclude "backend/*"` to push the frontend
9. Open `https://dev-hudloansales.housestrategiesgroup.com/` — admin flow should work end-to-end
10. Test: submit qualification at `/#/qualify`, then approve in admin

Estimated first-deploy time: **15–25 minutes** (ACM DNS validation is the long pole).
