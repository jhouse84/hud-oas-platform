# GoDaddy DNS records — SES email verification (audit S-9) — ✅ DONE

**Completed 2026-06-11.** The three DKIM CNAMEs were added at GoDaddy, SES
detected them within ~3 minutes, and the domain identity flipped to verified:

- `hudloansales.housestrategiesgroup.com` — **DKIM: SUCCESS · VerifiedForSending: true**
- Proof: a DKIM-aligned test email sent from
  `no-reply@hudloansales.housestrategiesgroup.com` → `jelani.house@housestrategiesgroup.com`
  (SES MessageId `0100019eb8a048fa-e82ead2f-…`).

Platform emails (bid receipts with completion CODEs, qualification decisions,
withdrawal confirmations, ops alerts) now send from the authenticated domain.

## Remaining email items (no DNS work)

| Item | State |
|---|---|
| SES production access (exit sandbox) | Requested via API 2026-06-11 — AWS review ~24h. Until granted, delivery only to verified addresses; receipts report `emailDelivered` honestly either way. |
| `jelani.house@housestrategiesgroup.com` | Verified ✅ |
| `jelani.house@gmail.com` (test bidder address) | Verification email sent — click the AWS link in Gmail so demo bid receipts deliver in sandbox |

The records, kept for reference:

| Type | Name (host) | Value |
|---|---|---|
| CNAME | `zpaziua5h2u6p4wxvb5xd3hgim54iw6o._domainkey.hudloansales` | `zpaziua5h2u6p4wxvb5xd3hgim54iw6o.dkim.amazonses.com` |
| CNAME | `jxaqheaac6kgupktiv45gxme4ymidf4f._domainkey.hudloansales` | `jxaqheaac6kgupktiv45gxme4ymidf4f.dkim.amazonses.com` |
| CNAME | `ghpo2lumyb6plheilgosaeovvrh2vprw._domainkey.hudloansales` | `ghpo2lumyb6plheilgosaeovvrh2vprw.dkim.amazonses.com` |
