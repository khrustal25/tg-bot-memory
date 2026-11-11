const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, loadDotEnv, root } = require('../src/config');
const { startHealthServer } = require('../src/health');

test('в проекте нет вписанного токена', () => {
  const token = /\d{6,}:[A-Za-z0-9_-]{20,}/;
  const skip = new Set(['node_modules', 'data', '.git']);
  const files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name) || entry.name === '.env') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|md|json|example|gitignore)$/.test(entry.name)) {
        files.push(full);
      }
    }
  }

  walk(root);
  assert.ok(files.length > 5);
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(token.test(source), false, file);
  }
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(ignore, /^\.env$/m);
  assert.match(ignore, /^\.env\.example$/m);
  assert.equal(fs.existsSync(path.join(root, '.env')), false);
  assert.equal(fs.existsSync(path.join(root, '.env.example')), false);
});

test('неверная временная зона не ломает настройку', () => {
  const config = loadConfig({
    TELEGRAM_BOT_TOKEN: 'test-token',
    APP_TIMEZONE: 'Not/AZone',
    DATA_FILE: '',
  });
  assert.equal(config.timeZone, 'Europe/Moscow');
  assert.equal(config.token, 'test-token');
});

test('файл .env не затирает уже заданную переменную', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimemi-env-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, 'AIMEMI_TEST_ONLY=from-file\n# comment\n', 'utf8');
  const previous = process.env.AIMEMI_TEST_ONLY;
  delete process.env.AIMEMI_TEST_ONLY;
  try {
    loadDotEnv(file);
    assert.equal(process.env.AIMEMI_TEST_ONLY, 'from-file');
    process.env.AIMEMI_TEST_ONLY = 'already';
    loadDotEnv(file);
    assert.equal(process.env.AIMEMI_TEST_ONLY, 'already');
  } finally {
    if (previous === undefined) delete process.env.AIMEMI_TEST_ONLY;
    else process.env.AIMEMI_TEST_ONLY = previous;
  }
});

test('служебная проверка отвечает ok и ничего лишнего', async () => {
  const previous = process.env.PORT;
  process.env.PORT = '18765';
  const server = startHealthServer();
  try {
    await new Promise((resolve, reject) => {
      if (server.listening) resolve();
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const result = await new Promise((resolve, reject) => {
      http.get('http://127.0.0.1:18765/health', (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, body }));
      }).on('error', reject);
    });
    assert.equal(result.status, 200);
    assert.equal(result.body, 'ok');
  } finally {
    server.close();
    if (previous === undefined) delete process.env.PORT;
    else process.env.PORT = previous;
  }
});
