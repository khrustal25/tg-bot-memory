const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function loadDotEnv(file = path.join(root, '.env')) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function safeTimeZone(value) {
  const timeZone = String(value || 'Europe/Moscow').trim() || 'Europe/Moscow';
  try {
    Intl.DateTimeFormat('ru-RU', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return 'Europe/Moscow';
  }
}

function loadConfig(env = process.env) {
  if (env === process.env) loadDotEnv();
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  const timeZone = safeTimeZone(env.APP_TIMEZONE);
  const dataFile = env.DATA_FILE
    ? path.resolve(String(env.DATA_FILE))
    : path.join(root, 'data', 'aimemi.sqlite');
  return { token, timeZone, dataFile, root };
}

module.exports = { loadConfig, loadDotEnv, root };
