# GoDaddy DNS records — SES email verification (audit S-9)

The ONE remaining external step in the security backlog. Add these three CNAME
records at GoDaddy for `housestrategiesgroup.com`, and SES domain verification
(DKIM) completes automatically within ~minutes-to-hours. Receipt and
notification emails then send from `no-reply@hudloansales.housestrategiesgroup.com`
with full DKIM alignment.

| Type | Name (host) | Value |
|---|---|---|
| CNAME | `zpaziua5h2u6p4wxvb5xd3hgim54iw6o._domainkey.hudloansales` | `zpaziua5h2u6p4wxvb5xd3hgim54iw6o.dkim.amazonses.com` |
| CNAME | `jxaqheaac6kgupktiv45gxme4ymidf4f._domainkey.hudloansales` | `jxaqheaac6kgupktiv45gxme4ymidf4f.dkim.amazonses.com` |
| CNAME | `ghpo2lumyb6plheilgosaeovvrh2vprw._domainkey.hudloansales` | `ghpo2lumyb6plheilgosaeovvrh2vprw.dkim.amazonses.com` |

Notes
- GoDaddy hosts the zone for `housestrategiesgroup.com`, so the host field is
  relative (ends at `…_domainkey.hudloansales`, no domain suffix).
- SES **production access** (exit sandbox) was requested via API on 2026-06-11;
  AWS typically reviews within 24h. Until then SES only delivers to verified
  addresses (jelani.house@gmail.com and jelani.house@housestrategiesgroup.com
  verification emails were sent — click the link in each).
- Check status any time:
  `AWS_PROFILE=hsg-hudoas aws sesv2 get-email-identity --email-identity hudloansales.housestrategiesgroup.com --region us-east-1 --query 'DkimAttributes.Status'`
