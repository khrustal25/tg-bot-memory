const ui = require('./messages');
const { redact } = require('./safe');
const { createHandlers } = require('./handlers');
const { createTelegram } = require('./telegram');

function extractContent(message) {
  if (
    message.sticker
    || message.animation
    || message.video
    || message.video_note
    || message.audio
    || message.contact
    || message.location
    || message.venue
    || message.poll
    || message.dice
  ) {
    return { type: 'unsupported' };
  }
  if (Array.isArray(message.photo) && message.photo.length) {
    const photo = message.photo[message.photo.length - 1];
    return { type: 'photo', text: message.caption || '', fileId: photo.file_id, fileName: null };
  }
  if (message.document) {
    return {
      type: 'document',
      text: message.caption || '',
      fileId: message.document.file_id,
      fileName: message.document.file_name || null,
    };
  }
  if (message.voice) {
    return { type: 'voice', text: message.caption || '', fileId: message.voice.file_id, fileName: null };
  }
  return null;
}

function toIncomingMessage(message) {
  return {
    userId: message.from && message.from.id,
    chatId: message.chat && message.chat.id,
    chatType: message.chat && message.chat.type,
    firstName: message.from && message.from.first_name,
    text: message.text || message.caption || '',
    content: extractContent(message),
    callback: null,
  };
}

function stripTags(text) {
  return String(text || '').replace(/<[^>]+>/g, '');
}

async function sendText(bot, chatId, text, markup) {
  const options = { reply_markup: markup };
  try {
    await bot.sendMessage(chatId, text, { ...options, parse_mode: 'HTML' });
  } catch (error) {
    try {
      await bot.sendMessage(chatId, stripTags(text), options);
    } catch (second) {
      console.error(redact(second && second.message ? second.message : second));
    }
  }
}

async function sendFile(bot, method, chatId, reply) {
  try {
    await bot[method](chatId, reply.fileId, { caption: reply.caption });
  } catch (error) {
    console.error(redact(error && error.message ? error.message : error));
    await sendText(bot, chatId, ui.fileUnavailable());
  }
}

async function deliver(bot, chatId, result) {
  if (!result) return;
  if (result.callbackId && bot.answerCallbackQuery) {
    try {
      await bot.answerCallbackQuery(result.callbackId, { text: result.callbackText || '' });
    } catch (error) {
      console.error(redact(error && error.message ? error.message : error));
    }
  }
  for (const reply of result.replies || []) {
    if (!chatId) continue;
    if (reply.kind === 'photo') await sendFile(bot, 'sendPhoto', chatId, reply);
    else if (reply.kind === 'document') await sendFile(bot, 'sendDocument', chatId, reply);
    else if (reply.kind === 'voice') await sendFile(bot, 'sendVoice', chatId, reply);
    else await sendText(bot, chatId, reply.text, reply.markup);
  }
}

function logPollingError(error) {
  const message = redact(error && error.message ? error.message : error);
  if (message.includes('401') || message.includes('Unauthorized')) {
    console.error('Telegram не принял токен. Проверь TELEGRAM_BOT_TOKEN в переменных окружения. Сам токен в лог не пишу.');
    return;
  }
  console.error(`Связь с Telegram прервалась, попробую снова. ${message}`);
}

async function syncBotMenu(bot) {
  try {
    await bot.deleteMyCommands();
  } catch (error) {
    console.error(redact(error && error.message ? error.message : error));
  }
  try {
    await bot.setMyCommands(ui.BOT_COMMANDS);
  } catch (error) {
    console.error(redact(error && error.message ? error.message : error));
  }
}

function startBot({ token, memory, timeZone }) {
  const handlers = createHandlers({ memory, timeZone });
  const bot = createTelegram(token);

  bot.on('message', async (message) => {
    if (!message || !message.chat || (message.from && message.from.is_bot)) return;
    try {
      await deliver(bot, message.chat.id, handlers.handle(toIncomingMessage(message)));
    } catch (error) {
      console.error(redact(error && error.stack ? error.stack : error));
      try {
        await bot.sendMessage(message.chat.id, ui.genericError());
      } catch (second) {
        console.error(redact(second && second.message ? second.message : second));
      }
    }
  });

  bot.on('callback_query', async (query) => {
    if (!query) return;
    const chat = query.message && query.message.chat;
    const incoming = {
      userId: query.from && query.from.id,
      chatId: chat && chat.id,
      chatType: chat && chat.type,
      firstName: query.from && query.from.first_name,
      text: '',
      content: null,
      callback: query.data || '',
    };
    try {
      const result = handlers.handle(incoming) || { replies: [] };
      result.callbackId = query.id;
      await deliver(bot, incoming.chatId, result);
    } catch (error) {
      console.error(redact(error && error.stack ? error.stack : error));
      try {
        await bot.answerCallbackQuery(query.id);
      } catch (second) {
        console.error(redact(second && second.message ? second.message : second));
      }
    }
  });

  bot.on('polling_error', logPollingError);

  syncBotMenu(bot)
    .catch((error) => {
      console.error(redact(error && error.message ? error.message : error));
    })
    .finally(() => {
      bot.startPolling();
    });

  const stop = () => {
    bot.stopPolling().catch(() => {});
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return bot;
}

module.exports = {
  extractContent,
  toIncomingMessage,
  deliver,
  logPollingError,
  syncBotMenu,
  startBot,
};
