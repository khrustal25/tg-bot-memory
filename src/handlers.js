const ui = require('./messages');

function createHandlers({ memory, timeZone = 'Europe/Moscow', now = () => new Date() }) {
  const sessions = new Map();

  function state(userId) {
    if (!sessions.has(userId)) {
      sessions.set(userId, {
        mode: 'idle',
        editId: null,
        browse: { kind: 'all', page: 0 },
        lastQuery: '',
      });
    }
    return sessions.get(userId);
  }

  function clearEdit(userId) {
    const session = state(userId);
    session.mode = 'idle';
    session.editId = null;
  }

  function handle(input) {
    try {
      if (!input || !input.userId || !input.chatId) return { replies: [] };
      if (input.chatType !== 'private') {
        return { replies: [ui.reply(ui.privateOnly())] };
      }
      if (input.callback) return onCallback(input);
      return onMessage(input);
    } catch {
      return { replies: [ui.reply(ui.genericError(), ui.mainKeyboard())] };
    }
  }

  function onMessage(input) {
    const text = String(input.text || '').trim();
    const command = ui.commandOf(text);
    const session = state(input.userId);

    if (command === 'start') {
      clearEdit(input.userId);
      return showWelcome(input);
    }
    if (command === 'help' || text === ui.MENU.help) {
      clearEdit(input.userId);
      return showHelp(input.userId);
    }
    if (command === 'menu') {
      clearEdit(input.userId);
      return showMenu(input.userId);
    }
    if (command === 'save' || text === ui.MENU.save) {
      clearEdit(input.userId);
      session.mode = 'save';
      return { replies: [ui.reply(ui.savePrompt(), ui.mainKeyboard())] };
    }
    if (command === 'find' || text === ui.MENU.find) {
      clearEdit(input.userId);
      session.mode = 'search';
      return { replies: [ui.reply(ui.findPrompt(), ui.mainKeyboard())] };
    }
    if (command === 'list' || text === ui.MENU.list) {
      clearEdit(input.userId);
      return showBrowse(input.userId, { kind: 'all', page: 0 });
    }
    if (command === 'fav' || text === ui.MENU.fav) {
      clearEdit(input.userId);
      return showBrowse(input.userId, { kind: 'fav', page: 0 });
    }
    if (command === 'unknown') {
      clearEdit(input.userId);
      const later = /\/(categories|remind|reminder|stats|settings|recent)\b/i.test(text);
      return {
        replies: [ui.reply(later ? ui.laterFeature() : ui.unknown(), ui.mainKeyboard())],
      };
    }

    if (session.mode === 'edit') {
      if (/^отмена$/i.test(text)) {
        const itemId = session.editId;
        clearEdit(input.userId);
        return showCard(input.userId, itemId);
      }
      if (input.content) {
        return {
          replies: [ui.reply(ui.editNeedText(), ui.editKeyboard(session.editId))],
        };
      }
      if (!text) {
        return {
          replies: [ui.reply(ui.editPrompt(), ui.editKeyboard(session.editId))],
        };
      }
      const item = memory.update(input.userId, session.editId, { text });
      clearEdit(input.userId);
      if (!item) return { replies: [ui.reply(ui.missing(), ui.mainKeyboard())] };
      return showCard(input.userId, item.id, { intro: ui.edited() });
    }

    if (input.content && input.content.type === 'unsupported') {
      return { replies: [ui.reply(ui.unsupported(), ui.mainKeyboard())] };
    }

    if (session.mode === 'search' && !input.content) {
      if (/^отмена$/i.test(text)) {
        session.mode = 'idle';
        return { replies: [ui.reply(ui.searchCancelled(), ui.mainKeyboard())] };
      }
      if (!text) return { replies: [ui.reply(ui.findPrompt(), ui.mainKeyboard())] };
      return runSearch(input.userId, text);
    }

    if (input.content) return saveContent(input.userId, input.content);
    if (text) return saveContent(input.userId, { type: 'text', text });
    return { replies: [ui.reply(ui.hint(), ui.mainKeyboard())] };
  }

  function onCallback(input) {
    const data = String(input.callback || '');
    const userId = input.userId;

    if (data === 'start') {
      const menu = showMenu(userId);
      menu.callbackText = 'Поехали';
      return menu;
    }
    if (data === 'back') {
      clearEdit(userId);
      return showBrowse(userId, state(userId).browse || { kind: 'all', page: 0 });
    }

    let match = /^open:(\d+)$/.exec(data);
    if (match) {
      clearEdit(userId);
      return showCard(userId, Number(match[1]), { withMedia: true });
    }

    match = /^edit:(\d+)$/.exec(data);
    if (match) {
      const item = memory.get(userId, Number(match[1]));
      if (!item) return { replies: [ui.reply(ui.missing())], callbackText: 'Не нашла' };
      const session = state(userId);
      session.mode = 'edit';
      session.editId = item.id;
      return {
        replies: [ui.reply(ui.editPrompt(), ui.editKeyboard(item.id))],
        callbackText: 'Редактируем',
      };
    }

    match = /^fav:(\d+)$/.exec(data);
    if (match) {
      const item = memory.toggleFavorite(userId, Number(match[1]));
      if (!item) return { replies: [ui.reply(ui.missing())], callbackText: 'Не нашла' };
      const intro = item.isFavorite ? ui.addedFav() : ui.removedFav();
      return {
        replies: [ui.reply(ui.card(item, timeZone, intro), ui.cardKeyboard(item))],
        callbackText: 'Готово',
      };
    }

    match = /^askdel:(\d+)$/.exec(data);
    if (match) {
      const item = memory.get(userId, Number(match[1]));
      if (!item) return { replies: [ui.reply(ui.missing())], callbackText: 'Не нашла' };
      return { replies: [ui.reply(ui.confirmDelete(), ui.deleteKeyboard(item.id))] };
    }

    match = /^del:(\d+)$/.exec(data);
    if (match) {
      const removed = memory.remove(userId, Number(match[1]));
      if (!removed) return { replies: [ui.reply(ui.missing())], callbackText: 'Не нашла' };
      const browse = state(userId).browse || { kind: 'all', page: 0 };
      const list = showBrowse(userId, { ...browse, direct: false });
      return {
        replies: [ui.reply(ui.deleted(), ui.mainKeyboard()), ...list.replies],
        callbackText: 'Удалила',
      };
    }

    if (data.startsWith('ls:')) return openList(userId, data);
    return { replies: [ui.reply(ui.staleButton(), ui.mainKeyboard())], callbackText: 'Кнопка устарела' };
  }

  function openList(userId, data) {
    const parts = data.split(':');
    const page = Number(parts[parts.length - 1]);
    if (!Number.isInteger(page) || page < 0) {
      return { replies: [ui.reply(ui.staleButton(), ui.mainKeyboard())] };
    }
    if (parts[1] === 'a' && parts.length === 3) return showBrowse(userId, { kind: 'all', page });
    if (parts[1] === 'f' && parts.length === 3) return showBrowse(userId, { kind: 'fav', page });
    if (parts[1] === 's' && parts.length === 3) {
      const query = state(userId).lastQuery;
      if (!query) return { replies: [ui.reply(ui.findPrompt(), ui.mainKeyboard())] };
      return showBrowse(userId, { kind: 'search', query, page });
    }
    return { replies: [ui.reply(ui.staleButton(), ui.mainKeyboard())] };
  }

  function showWelcome(input) {
    state(input.userId).mode = 'idle';
    return { replies: [ui.reply(ui.welcome(input.firstName), ui.startKeyboard())] };
  }

  function showMenu(userId) {
    state(userId).mode = 'idle';
    return { replies: [ui.reply(ui.menuIntro(), ui.mainKeyboard())] };
  }

  function showHelp(userId) {
    state(userId).mode = 'idle';
    return { replies: [ui.reply(ui.helpText(), ui.mainKeyboard())] };
  }

  function saveContent(userId, content) {
    const text = String(content.text || '').trim().slice(0, 4000);
    const fileId = content.fileId ? String(content.fileId).slice(0, 512) : null;
    const fileName = content.fileName ? String(content.fileName).slice(0, 200) : null;
    let type = content.type || 'text';
    if (!['text', 'link', 'photo', 'document', 'voice'].includes(type)) {
      return { replies: [ui.reply(ui.unsupported(), ui.mainKeyboard())] };
    }
    if ((type === 'photo' || type === 'document' || type === 'voice') && !fileId) {
      return { replies: [ui.reply(ui.unsupported(), ui.mainKeyboard())] };
    }
    if (!text && !fileId) return { replies: [ui.reply(ui.empty(), ui.mainKeyboard())] };
    if ((type === 'text' || type === 'link') && ui.hasUrl(text)) type = 'link';
    const item = memory.save({ userId, type, text, fileId, fileName });
    state(userId).mode = 'idle';
    return { replies: [ui.reply(ui.saved(item), ui.savedKeyboard(item))] };
  }

  function runSearch(userId, query) {
    const session = state(userId);
    session.lastQuery = query;
    const result = memory.search(userId, query, now());
    if (result.status === 'empty') return { replies: [ui.reply(ui.findPrompt(), ui.mainKeyboard())] };
    if (result.status === 'none' || result.items.length === 0) {
      session.browse = { kind: 'search', query, page: 0 };
      return { replies: [ui.reply(ui.nothingFound(), ui.mainKeyboard())] };
    }
    if (result.items.length === 1) {
      session.browse = { kind: 'search', query, page: 0 };
      return showCard(userId, result.items[0].id, { withMedia: true, intro: ui.foundOne() });
    }
    return showBrowse(userId, { kind: 'search', query, page: 0 });
  }

  function showBrowse(userId, browse) {
    const session = state(userId);
    session.browse = {
      kind: browse.kind,
      query: browse.query || session.lastQuery || '',
      page: browse.page || 0,
    };
    let items = [];
    let title = '';
    if (browse.kind === 'search') {
      const result = memory.search(userId, session.browse.query, now());
      if (result.status === 'empty') return { replies: [ui.reply(ui.findPrompt(), ui.mainKeyboard())] };
      items = result.items;
      if (!items.length) return { replies: [ui.reply(ui.nothingFound(), ui.mainKeyboard())] };
      title = items.length === 1 ? '🔎 Вот что нашлось' : ui.searchListTitle(items.length);
    } else if (browse.kind === 'fav') {
      items = memory.list(userId, { favorites: true });
      title = ui.favTitle(items.length);
      if (!items.length) return { replies: [ui.reply(ui.favEmpty(), ui.mainKeyboard())] };
    } else {
      items = memory.list(userId);
      title = ui.allTitle(items.length);
      if (!items.length) return { replies: [ui.reply(ui.allEmpty(), ui.mainKeyboard())] };
    }

    const pages = Math.max(1, Math.ceil(items.length / ui.PAGE_SIZE));
    const page = Math.min(Math.max(0, browse.page || 0), pages - 1);
    session.browse.page = page;
    const slice = items.slice(page * ui.PAGE_SIZE, page * ui.PAGE_SIZE + ui.PAGE_SIZE);
    return { replies: [ui.reply(ui.listText(title, slice, page), ui.listKeyboard(slice, page, pages, session.browse))] };
  }

  function showCard(userId, itemId, options = {}) {
    const item = memory.get(userId, itemId);
    if (!item) return { replies: [ui.reply(ui.missing(), ui.mainKeyboard())], callbackText: 'Не нашла' };
    const replies = [ui.reply(ui.card(item, timeZone, options.intro), ui.cardKeyboard(item))];
    if (options.withMedia && item.fileId && ['photo', 'document', 'voice'].includes(item.type)) {
      replies.push(ui.media(item));
    }
    return { replies, callbackText: 'Открыла' };
  }

  return { handle };
}

module.exports = { createHandlers };
