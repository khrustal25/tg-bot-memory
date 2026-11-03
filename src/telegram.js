const { redact } = require('./safe');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTelegram(token, fetchImpl = global.fetch) {
  const handlers = {
    message: [],
    callback_query: [],
    polling_error: [],
  };
  let running = false;
  let offset = 0;
  let abort = null;
  let loopPromise = null;

  async function call(method, payload, signal) {
    let response;
    try {
      response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      throw new Error('Не удалось связаться с Telegram');
    }

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    if (!response.ok || data.ok === false) {
      const description = String(data.description || 'Telegram отклонил запрос').slice(0, 200);
      const error = new Error(redact(`${data.error_code || response.status} ${description}`));
      error.code = data.error_code || response.status;
      throw error;
    }
    return data.result;
  }

  async function emit(event, payload) {
    for (const handler of handlers[event] || []) {
      try {
        await handler(payload);
      } catch (error) {
        console.error(redact(error && (error.stack || error.message) ? (error.stack || error.message) : error));
      }
    }
  }

  async function loop() {
    while (running) {
      try {
        abort = new AbortController();
        const updates = await call('getUpdates', {
          offset,
          timeout: 25,
          allowed_updates: ['message', 'callback_query'],
        }, abort.signal);
        for (const update of updates || []) {
          offset = update.update_id + 1;
          if (update.message) await emit('message', update.message);
          if (update.callback_query) await emit('callback_query', update.callback_query);
        }
      } catch (error) {
        if (!running || (error && error.name === 'AbortError')) return;
        const clean = new Error(redact(error && error.message ? error.message : 'Ошибка связи').slice(0, 300));
        clean.code = error && error.code;
        await emit('polling_error', clean);
        if (clean.code === 401 || clean.message.includes('401')) {
          running = false;
          return;
        }
        await sleep(2000);
      }
    }
  }

  return {
    on(event, handler) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    sendMessage(chatId, text, options = {}) {
      return call('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode,
        reply_markup: options.reply_markup,
      });
    },
    sendPhoto(chatId, fileId, options = {}) {
      return call('sendPhoto', { chat_id: chatId, photo: fileId, caption: options.caption });
    },
    sendDocument(chatId, fileId, options = {}) {
      return call('sendDocument', { chat_id: chatId, document: fileId, caption: options.caption });
    },
    sendVoice(chatId, fileId, options = {}) {
      return call('sendVoice', { chat_id: chatId, voice: fileId, caption: options.caption });
    },
    answerCallbackQuery(callbackId, options = {}) {
      return call('answerCallbackQuery', {
        callback_query_id: callbackId,
        text: options.text || '',
      });
    },
    setMyCommands(commands) {
      return call('setMyCommands', { commands });
    },
    deleteMyCommands() {
      return call('deleteMyCommands', {});
    },
    startPolling() {
      if (running) return;
      running = true;
      loopPromise = loop();
    },
    async stopPolling() {
      running = false;
      if (abort) abort.abort();
      if (loopPromise) await loopPromise.catch(() => {});
    },
  };
}

module.exports = { createTelegram };
