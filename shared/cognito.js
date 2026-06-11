/**
 * HSG.cognito — lightweight Cognito USER_PASSWORD_AUTH client.
 *
 * No SDK dependency — uses fetch to hit the Cognito IdP endpoint directly.
 * Handles: sign-in, sign-out, new-password challenge (first login), token refresh,
 * forgot-password / confirm-forgot-password, MFA challenge.
 *
 * Requires window.HSG_CONFIG to be populated with:
 *   userPoolId, userPoolClientId, region
 */
window.HSG = window.HSG || {};

HSG.cognito = (function () {
  'use strict';

  function cfg() {
    return window.HSG_CONFIG || {};
  }

  function endpoint() {
    return 'https://cognito-idp.' + (cfg().region || 'us-east-1') + '.amazonaws.com/';
  }

  function post(target, payload) {
    return fetch(endpoint(), {
      method: 'POST',
      headers: {
        'content-type': 'application/x-amz-json-1.1',
        'x-amz-target': 'AWSCognitoIdentityProviderService.' + target
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) {}
        if (!res.ok) {
          var err = new Error((data && (data.message || data.__type)) || ('Cognito ' + res.status));
          err.status = res.status;
          err.code = data && data.__type;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function storeTokens(auth) {
    if (!auth) return;
    var now = Math.floor(Date.now() / 1000);
    try {
      if (auth.IdToken)      sessionStorage.setItem('hsg.idToken', auth.IdToken);
      if (auth.AccessToken)  sessionStorage.setItem('hsg.accessToken', auth.AccessToken);
      if (auth.RefreshToken) sessionStorage.setItem('hsg.refreshToken', auth.RefreshToken);
      if (auth.ExpiresIn)    sessionStorage.setItem('hsg.expiresAt', String(now + auth.ExpiresIn));
    } catch (e) {}
  }

  function parseIdTokenClaims() {
    try {
      var t = sessionStorage.getItem('hsg.idToken');
      if (!t) return null;
      var parts = t.split('.');
      if (parts.length !== 3) return null;
      var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (payload.length % 4) payload += '=';
      return JSON.parse(atob(payload));
    } catch (e) { return null; }
  }

  function signIn(email, password) {
    return post('InitiateAuth', {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: cfg().userPoolClientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    }).then(function (res) {
      if (res.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
        return { challenge: 'NEW_PASSWORD_REQUIRED', session: res.Session, email: email, userAttributes: res.ChallengeParameters };
      }
      if (res.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
        return { challenge: 'SOFTWARE_TOKEN_MFA', session: res.Session, email: email };
      }
      if (res.AuthenticationResult) {
        storeTokens(res.AuthenticationResult);
        return { challenge: null, tokens: res.AuthenticationResult, claims: parseIdTokenClaims() };
      }
      return { challenge: res.ChallengeName || 'UNKNOWN', session: res.Session };
    });
  }

  function completeNewPassword(email, newPassword, session) {
    return post('RespondToAuthChallenge', {
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      ClientId: cfg().userPoolClientId,
      Session: session,
      ChallengeResponses: {
        USERNAME: email,
        NEW_PASSWORD: newPassword
      }
    }).then(function (res) {
      if (res.AuthenticationResult) {
        storeTokens(res.AuthenticationResult);
        return { tokens: res.AuthenticationResult, claims: parseIdTokenClaims() };
      }
      return { challenge: res.ChallengeName, session: res.Session };
    });
  }

  function respondMfa(email, code, session) {
    return post('RespondToAuthChallenge', {
      ChallengeName: 'SOFTWARE_TOKEN_MFA',
      ClientId: cfg().userPoolClientId,
      Session: session,
      ChallengeResponses: {
        USERNAME: email,
        SOFTWARE_TOKEN_MFA_CODE: code
      }
    }).then(function (res) {
      if (res.AuthenticationResult) {
        storeTokens(res.AuthenticationResult);
        return { tokens: res.AuthenticationResult, claims: parseIdTokenClaims() };
      }
      return { challenge: res.ChallengeName, session: res.Session };
    });
  }

  function refresh() {
    var rt;
    try { rt = sessionStorage.getItem('hsg.refreshToken'); } catch (e) {}
    if (!rt) return Promise.reject(new Error('No refresh token'));
    return post('InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: cfg().userPoolClientId,
      AuthParameters: { REFRESH_TOKEN: rt }
    }).then(function (res) {
      if (res.AuthenticationResult) {
        // Note: refresh response doesn't include a new RefreshToken — keep the existing one
        var merged = Object.assign({}, res.AuthenticationResult, { RefreshToken: rt });
        storeTokens(merged);
        return { tokens: merged, claims: parseIdTokenClaims() };
      }
      throw new Error('Refresh failed');
    });
  }

  function forgotPassword(email) {
    return post('ForgotPassword', {
      ClientId: cfg().userPoolClientId,
      Username: email
    });
  }

  function confirmForgotPassword(email, code, newPassword) {
    return post('ConfirmForgotPassword', {
      ClientId: cfg().userPoolClientId,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword
    });
  }

  function signOut() {
    try {
      sessionStorage.removeItem('hsg.idToken');
      sessionStorage.removeItem('hsg.accessToken');
      sessionStorage.removeItem('hsg.refreshToken');
      sessionStorage.removeItem('hsg.expiresAt');
    } catch (e) {}
  }

  // MFA setup (TOTP via authenticator app)
  function associateSoftwareToken(session) {
    var payload = session ? { Session: session } : { AccessToken: sessionStorage.getItem('hsg.accessToken') };
    return post('AssociateSoftwareToken', payload).then(function (res) {
      // Returns { SecretCode, Session? }. Use SecretCode to build otpauth URI for QR.
      return res;
    });
  }

  function verifySoftwareToken(code, friendlyName, session) {
    var payload = {
      UserCode: code,
      FriendlyDeviceName: friendlyName || 'HSG Authenticator'
    };
    if (session) payload.Session = session;
    else payload.AccessToken = sessionStorage.getItem('hsg.accessToken');
    return post('VerifySoftwareToken', payload);
  }

  function setMfaPreference(prefer) {
    return post('SetUserMFAPreference', {
      AccessToken: sessionStorage.getItem('hsg.accessToken'),
      SoftwareTokenMfaSettings: { Enabled: !!prefer, PreferredMfa: !!prefer }
    });
  }

  function buildOtpauthUri(email, secretCode, issuer) {
    var label = encodeURIComponent((issuer || 'HSG-HUDOAS') + ':' + email);
    var params = 'secret=' + secretCode + '&issuer=' + encodeURIComponent(issuer || 'HSG-HUDOAS');
    return 'otpauth://totp/' + label + '?' + params;
  }

  function isAuthenticated() {
    try {
      var t = sessionStorage.getItem('hsg.idToken');
      var exp = Number(sessionStorage.getItem('hsg.expiresAt') || 0);
      if (!t) return false;
      if (!exp) return true;
      return (Math.floor(Date.now() / 1000) < exp - 30);
    } catch (e) { return false; }
  }

  function currentUser() {
    if (!isAuthenticated()) return null;
    return parseIdTokenClaims();
  }

  return {
    signIn: signIn,
    completeNewPassword: completeNewPassword,
    respondMfa: respondMfa,
    associateSoftwareToken: associateSoftwareToken,
    verifySoftwareToken: verifySoftwareToken,
    setMfaPreference: setMfaPreference,
    buildOtpauthUri: buildOtpauthUri,
    refresh: refresh,
    forgotPassword: forgotPassword,
    confirmForgotPassword: confirmForgotPassword,
    signOut: signOut,
    isAuthenticated: isAuthenticated,
    currentUser: currentUser
  };
})();
