const { loadConfig } = require('./config');
const { openDatabase } = require('./db');
const { createMemory } = require('./memory');
const { startBot } = require('./bot');
const { startHealthServer } = require('./health');
const { redact } = require('./safe');

function main() {
  let sqlite;
  try {
    sqlite = require('node:sqlite');
  } catch {
    console.error('Для AIMEMI нужен Node.js 22 или новее. На Timeweb в настройках приложения выбери Node.js 22 или 24.');
    process.exitCode = 1;
    return;
  }
  if (!sqlite.DatabaseSync) {
    console.error('Для AIMEMI нужен Node.js 22 или новее. На Timeweb в настройках приложения выбери Node.js 22 или 24.');
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  if (!config.token) {
    console.error('Не найден TELEGRAM_BOT_TOKEN.');
    console.error('Добавь его в переменные окружения на Timeweb. В код и в GitHub токен класть не нужно.');
    process.exitCode = 1;
    return;
  }

  startHealthServer();

  let db;
  try {
    db = openDatabase(config.dataFile);
  } catch (error) {
    console.error('Не удалось открыть базу записей. Проверь, что папка проекта доступна для записи.');
    console.error(redact(error && error.message ? error.message : error));
    process.exitCode = 1;
    return;
  }

  const memory = createMemory(db, { timeZone: config.timeZone });
  startBot({ token: config.token, memory, timeZone: config.timeZone });
  console.log('AIMEMI запущена и ждёт сообщения в Telegram.');
}

process.on('uncaughtException', (error) => {
  console.error(redact(error && error.stack ? error.stack : error));
});

process.on('unhandledRejection', (error) => {
  console.error(redact(error && (error.stack || error.message) ? (error.stack || error.message) : error));
});

module.exports = { main };
