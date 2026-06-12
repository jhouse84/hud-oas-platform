"""
Deterministically switch the pool to admin-assisted recovery + branded SES
sending + email-OTP MFA, preserving every hardening setting. Uses describe →
re-pass-all → update, so update-user-pool can't silently reset anything.
"""
import json, subprocess, os, sys, tempfile

REGION = 'us-east-1'
POOL = 'us-east-1_Qg4tpC0jh'
SES_ARN = 'arn:aws:ses:us-east-1:057079472274:identity/hudloansales.housestrategiesgroup.com'
ENV = dict(os.environ, AWS_PROFILE='hsg-hudoas')

def aws(args, inp=None):
    r = subprocess.run(['aws'] + args + ['--region', REGION, '--output', 'json'],
                       capture_output=True, text=True, env=ENV)
    if r.returncode != 0:
        print('AWS ERROR:', ' '.join(args[:3]), '\n', r.stderr.strip()[:600]); sys.exit(1)
    return json.loads(r.stdout) if r.stdout.strip() else {}

up = aws(['cognito-idp', 'describe-user-pool', '--user-pool-id', POOL])['UserPool']
print('BEFORE — tier:', up.get('UserPoolTier'),
      '| advSec:', (up.get('UserPoolAddOns') or {}).get('AdvancedSecurityMode'),
      '| pwMin:', (up.get('Policies', {}).get('PasswordPolicy', {}) or {}).get('MinimumLength'),
      '| recovery:', [m['Name'] for m in (up.get('AccountRecoverySetting') or {}).get('RecoveryMechanisms', [])],
      '| sending:', (up.get('EmailConfiguration') or {}).get('EmailSendingAccount'))

# Copy every updatable field verbatim from describe, then override the three we change.
COPY = ['Policies', 'DeletionProtection', 'LambdaConfig', 'AutoVerifiedAttributes',
        'SmsVerificationMessage', 'EmailVerificationMessage', 'EmailVerificationSubject',
        'VerificationMessageTemplate', 'SmsAuthenticationMessage', 'UserAttributeUpdateSettings',
        'MfaConfiguration', 'DeviceConfiguration', 'AdminCreateUserConfig', 'UserPoolAddOns',
        'UserPoolTags', 'UserPoolTier']
payload = {'UserPoolId': POOL}
for k in COPY:
    if k in up and up[k] not in (None, {}, []):
        payload[k] = up[k]
payload['MfaConfiguration'] = 'ON'
payload['AccountRecoverySetting'] = {'RecoveryMechanisms': [{'Name': 'admin_only', 'Priority': 1}]}
payload['EmailConfiguration'] = {
    'EmailSendingAccount': 'DEVELOPER',
    'SourceArn': SES_ARN,
    'From': 'HUD OAS Platform <no-reply@hudloansales.housestrategiesgroup.com>',
}

with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as tf:
    json.dump(payload, tf); tmp = tf.name
aws(['cognito-idp', 'update-user-pool', '--cli-input-json', 'file://' + tmp])
print('update-user-pool: OK (admin_only recovery + DEVELOPER sending, all else preserved)')

aws(['cognito-idp', 'set-user-pool-mfa-config', '--user-pool-id', POOL,
     '--mfa-configuration', 'ON',
     '--software-token-mfa-configuration', 'Enabled=true',
     '--email-mfa-configuration', json.dumps({
         'Message': 'Your HUD OAS Platform sign-in code is {####}. It expires in a few minutes.',
         'Subject': 'Your HUD OAS Platform sign-in code'})])
print('set-user-pool-mfa-config: OK (email OTP + TOTP)')

# Verify nothing security-critical regressed
after = aws(['cognito-idp', 'describe-user-pool', '--user-pool-id', POOL])['UserPool']
mfa = aws(['cognito-idp', 'get-user-pool-mfa-config', '--user-pool-id', POOL])
print('AFTER  — tier:', after.get('UserPoolTier'),
      '| advSec:', (after.get('UserPoolAddOns') or {}).get('AdvancedSecurityMode'),
      '| pwMin:', (after.get('Policies', {}).get('PasswordPolicy', {}) or {}).get('MinimumLength'),
      '| recovery:', [m['Name'] for m in (after.get('AccountRecoverySetting') or {}).get('RecoveryMechanisms', [])],
      '| sending:', (after.get('EmailConfiguration') or {}).get('EmailSendingAccount'))
print('MFA    — config:', mfa.get('MfaConfiguration'),
      '| emailMFA:', 'ON' if mfa.get('EmailMfaConfiguration') else 'off',
      '| totp:', (mfa.get('SoftwareTokenMfaConfiguration') or {}).get('Enabled'))
