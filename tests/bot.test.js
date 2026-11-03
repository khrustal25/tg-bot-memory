const test = require('node:test');
const assert = require('node:assert/strict');
const { deliver, extractContent, logPollingError } = require('../src/bot');
const { createTelegram } = require('../src/telegram');
const { redact } = require('../src/safe');

function fakeToken() {
  return ['bot123456789', 'ABCDEFghijklmnopqrstuvwxyz123456'].join(':');
}

test('скрывает токен в тексте ошибки', () => {
  const secret = fakeToken();
  const hidden = redact(`ошибка https://api.telegram.org/${secret}/getUpdates`);
  assert.equal(hidden.includes('ABCDEF'), false);
  assert.match(hidden, /bot<скрыто>/);
});

test('при отказе Telegram не печатает токен', () => {
  const logs = [];
  const original = console.error;
  console.error = (message) => logs.push(String(message));
  try {
    logPollingError(new Error(`401 Unauthorized https://api.telegram.org/${fakeToken()}/getUpdates`));
  } finally {
    console.error = original;
  }
  assert.match(logs[0], /не принял токен/);
  assert.equal(logs[0].includes('ABCDEF'), false);
});

test('берёт большое фото, документ и голос', () => {
  const photo = extractContent({
    photo: [{ file_id: 'small' }, { file_id: 'large' }],
    caption: 'схема',
  });
  assert.equal(photo.fileId, 'large');
  assert.equal(photo.type, 'photo');

  const voice = extractContent({ voice: { file_id: 'voice-file' } });
  assert.equal(voice.type, 'voice');

  const file = extractContent({ document: { file_id: 'doc', file_name: 'Конспект.pdf' } });
  assert.equal(file.fileName, 'Конспект.pdf');
  assert.equal(extractContent({ sticker: { file_id: 'sticker' } }).type, 'unsupported');
});

test('если файл не открылся, человеку уходит спокойное сообщение', async () => {
  const bot = {
    texts: [],
    async sendPhoto() {
      throw new Error(`Bad Request: wrong file ${fakeToken()}`);
    },
    async sendMessage(chatId, text) {
      this.texts.push(text);
    },
    async answerCallbackQuery() {},
  };
  const logs = [];
  const original = console.error;
  console.error = (message) => logs.push(String(message));
  try {
    await deliver(bot, 5, {
      callbackId: 'cb',
      callbackText: 'Открыла',
      replies: [{ kind: 'photo', fileId: 'missing', caption: 'Фото' }],
    });
  } finally {
    console.error = original;
  }
  assert.match(bot.texts[0], /файл сейчас не открывается/);
  assert.equal(bot.texts.join('').includes('ABCDEF'), false);
  assert.equal(logs.join('').includes('ABCDEF'), false);
});

test('запрос к Telegram не возвращает токен в ошибке', async () => {
  const token = fakeToken();
  const bodies = [];
  const client = createTelegram(token, async (url, options) => {
    const method = String(url).split('/').pop();
    if (method === 'sendMessage') {
      bodies.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: false, error_code: 401, description: 'Unauthorized' }), {
      status: 401,
    });
  });

  await client.sendMessage(5, 'привет', {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [] },
  });
  assert.equal(bodies[0].chat_id, 5);
  assert.equal(bodies[0].text, 'привет');
  assert.equal(bodies[0].parse_mode, 'HTML');

  const error = await new Promise((resolve) => {
    client.on('polling_error', resolve);
    client.startPolling();
  });
  await client.stopPolling();
  assert.match(error.message, /401/);
  assert.equal(error.message.includes('ABCDEF'), false);
  assert.equal(String(error.stack || '').includes(token), false);
});
