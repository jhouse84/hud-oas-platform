import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({ region: process.env.REGION || process.env.AWS_REGION });
const FROM = process.env.SES_FROM || 'no-reply@hudloansales.housestrategiesgroup.com';

export async function sendEmail({ to, subject, text, html, cc, replyTo }) {
  const toList = Array.isArray(to) ? to : [to];
  const cmd = new SendEmailCommand({
    Source: `HUD OAS Platform <${FROM}>`,
    Destination: { ToAddresses: toList, CcAddresses: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined },
    ReplyToAddresses: replyTo ? (Array.isArray(replyTo) ? replyTo : [replyTo]) : undefined,
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Text: text ? { Data: text, Charset: 'UTF-8' } : undefined,
        Html:  html ? { Data: html,  Charset: 'UTF-8' } : undefined
      }
    }
  });
  try {
    const res = await ses.send(cmd);
    return { delivered: true, messageId: res.MessageId };
  } catch (err) {
    // Email failure never fails the request — but callers can now surface it
    // (a bidder must not believe a receipt email arrived when it did not).
    console.error('SES send failed', { to: toList, subject, error: err?.message });
    return { delivered: false, messageId: null, error: err?.message };
  }
}

export const EMAIL_TEMPLATES = {
  applicationReceived(bidder) {
    return {
      subject: `Application received — ${bidder.entityName}`,
      text: `Thank you. Your bidder qualification application (${bidder.bidderId}) has been received. Current status: ${bidder.qualificationStatus}. Expect a decision within 10–15 business days.`,
      html: `
        <div style="font-family:system-ui,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#1A1B1E;">
          <div style="background:#2D2E8F;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0;"><strong>HUD OAS Platform</strong></div>
          <div style="background:#fff;padding:24px;border:1px solid #E4E5E8;border-top:0;border-radius:0 0 10px 10px;">
            <h2 style="margin:0 0 12px;color:#1A1B1E;">Application received</h2>
            <p>Thank you, <strong>${escapeHtml(bidder.entityName)}</strong>.</p>
            <p>Your bidder qualification application has been received by the HUD OAS Transaction Specialist.</p>
            <table style="width:100%;font-size:13px;margin:12px 0;border-collapse:collapse;">
              <tr><td style="padding:4px 0;color:#57595F;">Application ID</td><td style="text-align:right;font-family:monospace;">${escapeHtml(bidder.bidderId)}</td></tr>
              <tr><td style="padding:4px 0;color:#57595F;">Status</td><td style="text-align:right;"><strong>${escapeHtml(bidder.qualificationStatus)}</strong></td></tr>
              <tr><td style="padding:4px 0;color:#57595F;">Submitted</td><td style="text-align:right;">${escapeHtml(bidder.submittedDate)}</td></tr>
            </table>
            <p style="color:#57595F;font-size:13px;">Expect a decision within 10–15 business days after OFAC/SAM verification.</p>
          </div>
        </div>
      `
    };
  },
  approved(bidder) {
    return {
      subject: `You're qualified — ${bidder.entityName}`,
      text: `Congratulations. ${bidder.entityName} (${bidder.bidderId}) has been approved as a Qualified Bidder. Programs: ${(bidder.programTypes||[]).join(', ')}.`,
      html: `
        <div style="font-family:system-ui,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#1A1B1E;">
          <div style="background:#1E7E3E;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0;"><strong>You're qualified ✓</strong></div>
          <div style="background:#fff;padding:24px;border:1px solid #E4E5E8;border-top:0;border-radius:0 0 10px 10px;">
            <p><strong>${escapeHtml(bidder.entityName)}</strong> has been approved as a Qualified Bidder.</p>
            <p>You may now execute Confidentiality Agreements, access data rooms, and submit bids on qualified programs:
              <strong>${escapeHtml((bidder.programTypes||[]).join(', '))}</strong>.</p>
          </div>
        </div>
      `
    };
  },
  declined(bidder, reason) {
    return {
      subject: `Application decision — ${bidder.entityName}`,
      text: `Your application (${bidder.bidderId}) has been declined. Reason: ${reason}.`,
      html: `
        <div style="font-family:system-ui,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#1A1B1E;">
          <div style="background:#A0321A;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0;"><strong>Application decision</strong></div>
          <div style="background:#fff;padding:24px;border:1px solid #E4E5E8;border-top:0;border-radius:0 0 10px 10px;">
            <p>Your qualification application has been declined.</p>
            <p><strong>Reason:</strong> ${escapeHtml(reason || 'See review notes')}</p>
          </div>
        </div>
      `
    };
  },
  infoRequested(bidder, note) {
    return {
      subject: `Additional information needed — ${bidder.entityName}`,
      text: `The Transaction Specialist has requested additional information. ${note}`,
      html: `
        <div style="font-family:system-ui,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#1A1B1E;">
          <div style="background:#D97706;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0;"><strong>Additional info requested</strong></div>
          <div style="background:#fff;padding:24px;border:1px solid #E4E5E8;border-top:0;border-radius:0 0 10px 10px;">
            <p>The Transaction Specialist has requested additional information.</p>
            <p style="background:#F7F7F8;padding:12px;border-left:3px solid #D97706;">${escapeHtml(note)}</p>
          </div>
        </div>
      `
    };
  }
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
