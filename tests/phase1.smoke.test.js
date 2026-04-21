const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}

function createUiDocument() {
  const elements = new Map();
  function createElement(id) {
    return {
      id,
      value: '',
      textContent: '',
      className: '',
      style: {},
      checked: false,
      innerHTML: '',
      addEventListener() {},
      removeEventListener() {},
      showModal() {
        this.open = true;
      },
      close() {
        this.open = false;
      },
      querySelector() {
        return createElement(`${id}-child`);
      },
      classList: {
        add() {},
        remove() {},
      },
    };
  }

  return {
    addEventListener() {},
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, createElement(id));
      }
      return elements.get(id);
    },
    querySelectorAll(selector) {
      if (selector === '.token-raw-toggle' || selector === '.token-raw') {
        return [createElement(`${selector}-1`), createElement(`${selector}-2`)];
      }
      return [];
    },
    createElement(tag) {
      return createElement(tag);
    },
  };
}

function createSandbox(extra = {}) {
  const sessionStorage = createStorage();
  const localStorage = createStorage();
  const sandbox = {
    console,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Math,
    encodeURIComponent,
    decodeURIComponent,
    navigator: { language: 'en-US' },
    sessionStorage,
    localStorage,
    alert() {},
    axios: {
      defaults: { headers: { common: {} } },
      get: async () => ({ data: { value: [] } }),
      post: async () => ({ data: {} }),
    },
    document: createUiDocument(),
    window: {},
    ...extra,
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.__vmContext = vm.createContext(sandbox);
  return sandbox;
}

function runScript(sandbox, relativePath) {
  const repoRoot = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  vm.runInContext(source, sandbox.__vmContext, { filename: relativePath });
  return sandbox;
}

function evaluate(sandbox, expression) {
  return vm.runInContext(expression, sandbox.__vmContext);
}

test('config exposes Phase 1 native auth endpoints and Graph split', () => {
  const sandbox = createSandbox({ __APP_CONFIG__: {} });
  runScript(sandbox, 'public/js/config.js');

  const env = evaluate(sandbox, 'ENV');
  const selfServiceEndpoints = evaluate(sandbox, 'GRAPH_SELF_SERVICE_ENDPOINTS');
  const operatorEndpoints = evaluate(sandbox, 'GRAPH_OPERATOR_ENDPOINTS');

  assert.equal(env.urlSignupStart.endsWith('/signup/v1.0/start'), true);
  assert.equal(env.urlResetPasswordPollCompletion.endsWith('/resetpassword/v1.0/poll_completion'), true);
  assert.equal(env.urlEmailRecoveryByPhone, '/account-recovery/email-by-phone');
  assert.equal(typeof selfServiceEndpoints.me, 'string');
  assert.equal(typeof operatorEndpoints.userDetail, 'function');
});

test('forgot email recovery posts phone number to backend route', async () => {
  const calls = [];
  const sandbox = createSandbox({
    postRequest: async (url, payload, context) => {
      calls.push({ url, payload, context });
      return { matched: true, message: 'We found an account for that phone number: m****@example.com' };
    },
    clearLoginNotice() {},
    setLoginNotice() {},
    showErrorDiagnostics() {},
  });
  runScript(sandbox, 'public/js/config.js');
  runScript(sandbox, 'public/js/nativeAuth.js');

  const response = await sandbox.recoverEmailByPhone('+1 202-555-1234');
  assert.equal(response.matched, true);
  assert.equal(calls[0].url, '/account-recovery/email-by-phone');
  assert.equal(calls[0].payload.phone_number, '+1 202-555-1234');
  assert.equal(calls[0].context.flowName, 'account-recovery');
});

test('native auth enforces required sign-up attributes from runtime config', () => {
  const sandbox = createSandbox({
    __APP_CONFIG__: {
      SIGNUP_REQUIRED_ATTRIBUTES: 'postalCode,city',
      SIGNUP_ATTRIBUTE_TEMPLATE: '{"postalCode":"98052"}',
    },
    postRequest: async () => ({ continuation_token: 'token' }),
    setLoginNotice() {},
    showErrorDiagnostics() {},
  });
  runScript(sandbox, 'public/js/config.js');
  runScript(sandbox, 'public/js/i18n.js');
  runScript(sandbox, 'public/js/nativeAuth.js');

  const attributes = sandbox.mergeSignUpAttributes('{"postalCode":"98052"}', 'Ada Lovelace');
  assert.deepEqual(Array.from(sandbox.getMissingRequiredSignUpAttributes(attributes)), ['city']);
});

test('sign-up start posts password and attributes to the signup start endpoint', async () => {
  const calls = [];
  const sandbox = createSandbox({
    postRequest: async (url, payload, context) => {
      calls.push({ url, payload, context });
      return { continuation_token: 'next-token' };
    },
  });
  runScript(sandbox, 'public/js/config.js');
  runScript(sandbox, 'public/js/nativeAuth.js');
  const env = evaluate(sandbox, 'ENV');

  const result = await sandbox.signUpStart('user@contoso.com', 'P@ssword123!', { postalCode: '98052' });
  assert.equal(result.continuation_token, 'next-token');
  assert.equal(calls[0].url, env.urlSignupStart);
  assert.equal(calls[0].payload.password, 'P@ssword123!');
  assert.equal(calls[0].payload.attributes, JSON.stringify({ postalCode: '98052' }));
  assert.equal(calls[0].context.flowName, 'signup');
});

test('reset password submit posts new_password and poll helper retries until success', async () => {
  const calls = [];
  const responses = [
    { status: 'in_progress', continuation_token: 'poll-2' },
    { status: 'succeeded', continuation_token: 'final-token' },
  ];
  const sandbox = createSandbox({
    postRequest: async (url, payload) => {
      calls.push({ url, payload });
      if (url.endsWith('/submit')) {
        return { continuation_token: 'poll-1', poll_interval: 0 };
      }
      if (url.endsWith('/poll_completion')) {
        return responses.shift();
      }
      return { continuation_token: 'noop' };
    },
  });
  runScript(sandbox, 'public/js/config.js');
  runScript(sandbox, 'public/js/i18n.js');
  runScript(sandbox, 'public/js/nativeAuth.js');

  const submitRes = await sandbox.resetPasswordSubmit('submit-token', 'NewP@ssword123!');
  assert.equal(submitRes.poll_interval, 0);
  const pollRes = await sandbox.pollResetPasswordCompletion('poll-1', 0);
  assert.equal(pollRes.status, 'succeeded');
  assert.equal(calls[0].payload.new_password, 'NewP@ssword123!');
});

test('demo mode toggle persists state in sessionStorage', () => {
  const sandbox = createSandbox();
  runScript(sandbox, 'public/js/config.js');
  runScript(sandbox, 'public/js/ui.js');

  sandbox.setDemoMode(true, { silent: true });
  assert.equal(sandbox.sessionStorage.getItem('nativeAuth_demo_mode'), 'true');
  assert.equal(sandbox.isDemoModeEnabled(), true);
});

test('native auth refresh posts refresh_token grant to token endpoint', async () => {
  const calls = [];
  const sandbox = createSandbox({
    postRequest: async (url, payload, context) => {
      calls.push({ url, payload, context });
      return { access_token: 'new-access', refresh_token: 'new-refresh', id_token: 'new-id' };
    },
    setLoginNotice() {},
    showErrorDiagnostics() {},
  });
  sandbox.sessionStorage.setItem('nativeAuth_refresh_token', 'stored-refresh');
  runScript(sandbox, 'public/js/config.js');
  runScript(sandbox, 'public/js/i18n.js');
  runScript(sandbox, 'public/js/ui.js');
  sandbox.renderNativeAuthenticatedUI = function renderNativeAuthenticatedUI(response) {
    sandbox.lastResponse = response;
  };
  runScript(sandbox, 'public/js/nativeAuth.js');
  const env = evaluate(sandbox, 'ENV');

  const result = await sandbox.refreshNativeAuthSession();
  assert.equal(result.access_token, 'new-access');
  assert.equal(calls[0].url, env.urlOauthToken);
  assert.equal(calls[0].payload.grant_type, 'refresh_token');
  assert.equal(calls[0].payload.refresh_token, 'stored-refresh');
  assert.equal(calls[0].context.flowStep, 'token:refresh_token');
});

test('msal silent refresh acquires token silently and renders authenticated UI', async () => {
  const calls = [];
  class MockPublicClientApplication {
    constructor() {
      this.activeAccount = null;
      this.accounts = [{ homeAccountId: 'acct-1', username: 'user@contoso.com', idTokenClaims: { name: 'User' } }];
    }
    initialize() {
      return Promise.resolve();
    }
    handleRedirectPromise() {
      return Promise.resolve(null);
    }
    getActiveAccount() {
      return this.activeAccount;
    }
    setActiveAccount(account) {
      this.activeAccount = account;
    }
    getAllAccounts() {
      return this.accounts;
    }
    acquireTokenSilent(request) {
      calls.push(request);
      return Promise.resolve({
        accessToken: 'header.payload.signature',
        idToken: 'header.payload.signature',
        idTokenClaims: { name: 'User' },
      });
    }
  }

  const sandbox = createSandbox({
    msal: { PublicClientApplication: MockPublicClientApplication },
    parseJwt() {
      return { exp: Math.floor(Date.now() / 1000) + 3600 };
    },
    renderAuthenticatedUI(payload) {
      sandbox.lastRendered = payload;
    },
    setLoginNotice() {},
    showErrorDiagnostics() {},
    refreshTokenGuidance() {},
    setSessionInteractionType() {},
    getSessionInteractionType() { return 'popup'; },
    hasNativeSession() { return false; },
  });
  runScript(sandbox, 'public/js/config.js');
  runScript(sandbox, 'public/js/msalAuth.js');

  await sandbox.refreshMsalSessionSilently({ account: { homeAccountId: 'acct-1', idTokenClaims: { name: 'User' } }, reason: 'test' });
  assert.equal(calls[0].scopes.includes('openid'), true);
  assert.equal(sandbox.lastRendered.accessToken, 'header.payload.signature');
});