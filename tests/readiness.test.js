const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('../src/db');
const { createMemory } = require('../src/memory');
const { createHandlers } = require('../src/handlers');
const ui = require('../src/messages');

const now = new Date('2026-11-02T12:00:00+03:00');

function fresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimemi-'));
  const file = path.join(dir, 'memory.sqlite');
  const db = openDatabase(file);
  const memory = createMemory(db, { timeZone: 'Europe/Moscow' });
  const handlers = createHandlers({ memory, timeZone: 'Europe/Moscow', now: () => now });
  return {
    file,
    memory,
    handlers,
    close: () => memory.close(),
  };
}

function person(id, extra = {}) {
  return {
    userId: id,
    chatId: id,
    chatType: 'private',
    firstName: 'Аня',
    text: '',
    content: null,
    callback: null,
    ...extra,
  };
}

function textsOf(markup) {
  const rows = (markup && (markup.keyboard || markup.inline_keyboard)) || [];
  return rows.flat().map((button) => button.text);
}

function callbacksOf(markup) {
  const rows = (markup && markup.inline_keyboard) || [];
  return rows.flat().map((button) => button.callback_data);
}

test('приветствие, меню и путь сохранения', () => {
  const app = fresh();
  const welcome = app.handlers.handle(person(1, { text: '/start' }));
  assert.match(welcome.replies[0].text, /AIMEMI — твоя вторая память/);
  assert.ok(textsOf(welcome.replies[0].markup).includes('🚀 Начать'));

  const named = app.handlers.handle(person(1, { text: '/start@AimemiBot', firstName: 'Аня <3' }));
  assert.match(named.replies[0].text, /Привет, Аня &lt;3!/);

  const menu = app.handlers.handle(person(1, { callback: 'start' }));
  assert.deepEqual(textsOf(menu.replies[0].markup), [
    ui.MENU.save,
    ui.MENU.find,
    ui.MENU.list,
    ui.MENU.fav,
    ui.MENU.help,
  ]);
  assert.equal(JSON.stringify(menu.replies[0].markup).includes('Напоминания'), false);
  assert.equal(JSON.stringify(menu.replies[0].markup).includes('Настройки'), false);

  const savePrompt = app.handlers.handle(person(1, { text: ui.MENU.save }));
  assert.match(savePrompt.replies[0].text, /Пришли то, что нужно запомнить/);

  const note = app.handlers.handle(person(1, { text: 'Встреча с клиентом в понедельник' }));
  assert.match(note.replies[0].text, /Готово! Запомнила и сохранила!/);
  assert.match(note.replies[0].text, /Информация сохранена в категорию «Работа»/);

  const link = app.handlers.handle(person(1, {
    text: 'Сервис для создания AI-видео https://example.com/video',
  }));
  assert.match(link.replies[0].text, /сохранена/);
  assert.equal(link.replies[0].text.includes('Другое'), false);
  const linkId = Number(callbacksOf(link.replies[0].markup)[0].split(':')[1]);
  const opened = app.handlers.handle(person(1, { callback: `open:${linkId}` }));
  assert.match(opened.replies[0].text, /Тип: ссылка/);
  assert.match(opened.replies[0].text, /example\.com/);

  const records = app.handlers.handle(person(1, { text: ui.MENU.list }));
  const buttons = textsOf(records.replies[0].markup);
  assert.ok(buttons.includes('⭐ Избранное'));
  assert.equal(buttons.some((text) => /Работа|Личное|Идеи|Обучение|Покупки|Другое|^Все$|• Все/.test(text)), false);

  app.close();
});

test('сохраняет фото, документ, голос и не принимает стикер', () => {
  const app = fresh();
  const photo = app.handlers.handle(person(1, {
    content: { type: 'photo', text: 'Идея обложки', fileId: 'photo-1', fileName: null },
  }));
  assert.match(photo.replies[0].text, /категорию «Идеи»/);

  const document = app.handlers.handle(person(1, {
    content: { type: 'document', text: '', fileId: 'doc-1', fileName: 'Договор.pdf' },
  }));
  assert.match(document.replies[0].text, /категорию «Работа»/);
  const documentId = Number(callbacksOf(document.replies[0].markup)[0].split(':')[1]);
  const opened = app.handlers.handle(person(1, { callback: `open:${documentId}` }));
  assert.equal(opened.replies[1].kind, 'document');
  assert.equal(opened.replies[1].fileId, 'doc-1');

  const voice = app.handlers.handle(person(1, {
    content: { type: 'voice', text: '', fileId: 'voice-1', fileName: null },
  }));
  assert.match(voice.replies[0].text, /Информация сохранена/);
  const voiceId = Number(callbacksOf(voice.replies[0].markup)[0].split(':')[1]);
  const voiceCard = app.handlers.handle(person(1, { callback: `open:${voiceId}` }));
  assert.equal(voiceCard.replies[1].kind, 'voice');

  const sticker = app.handlers.handle(person(1, { content: { type: 'unsupported' } }));
  assert.match(sticker.replies[0].text, /фото, документы и голосовые/);
  assert.equal(app.memory.list(1).some((item) => item.type === 'unsupported'), false);

  const reminder = app.handlers.handle(person(1, { text: 'Напомни купить хлеб' }));
  assert.match(reminder.replies[0].text, /Напоминания появятся позже/);
  assert.match(reminder.replies[0].text, /«Покупки»/);

  app.close();
});

test('ищет, открывает, избранное и удаление', () => {
  const app = fresh();
  app.memory.save({
    userId: 1,
    type: 'link',
    text: 'Сервис для создания AI-видео https://example.com/video',
    createdAt: '2026-10-28T10:00:00.000Z',
  });
  app.memory.save({
    userId: 1,
    type: 'text',
    text: 'Купить молоко',
    createdAt: '2026-11-02T08:00:00.000Z',
  });
  app.memory.save({
    userId: 2,
    type: 'link',
    text: 'Сервис для создания AI-видео секрет другого человека',
    createdAt: '2026-10-28T10:00:00.000Z',
  });

  app.handlers.handle(person(1, { text: ui.MENU.find }));
  const found = app.handlers.handle(person(1, {
    text: 'Найди ссылку на сервис для создания AI-видео, которую я сохраняла на прошлой неделе',
  }));
  assert.match(found.replies[0].text, /Сейчас поищу в твоих воспоминаниях/);
  assert.match(found.replies[0].text, /Нашла! Кажется, это именно то, что ты искала/);
  assert.match(found.replies[0].text, /example\.com/);
  assert.equal(found.replies[0].text.includes('секрет другого'), false);

  const id = Number(callbacksOf(found.replies[0].markup).find((item) => item.startsWith('fav:')).split(':')[1]);
  const favorite = app.handlers.handle(person(1, { callback: `fav:${id}` }));
  assert.match(favorite.replies[0].text, /Добавила в избранное/);
  const favorites = app.handlers.handle(person(1, { text: ui.MENU.fav }));
  assert.match(favorites.replies[0].text, /AI-видео/);
  assert.equal(favorites.replies[0].text.includes('молоко'), false);

  const editAsk = app.handlers.handle(person(1, { callback: `edit:${id}` }));
  assert.match(editAsk.replies[0].text, /Пришли новый текст/);
  const edited = app.handlers.handle(person(1, { text: 'Обновлённый сервис для AI-видео https://example.com/new' }));
  assert.match(edited.replies[0].text, /Обновила запись/);
  assert.match(edited.replies[0].text, /example\.com\/new/);
  assert.equal(app.memory.get(1, id).text.includes('Обновлённый сервис'), true);

  const foreign = app.handlers.handle(person(2, { callback: `open:${id}` }));
  assert.match(foreign.replies[0].text, /Не нашла/);
  const foreignDelete = app.handlers.handle(person(2, { callback: `del:${id}` }));
  assert.match(foreignDelete.replies[0].text, /Не нашла/);
  assert.ok(app.memory.get(1, id));

  app.handlers.handle(person(1, { callback: `askdel:${id}` }));
  const removed = app.handlers.handle(person(1, { callback: `del:${id}` }));
  assert.match(removed.replies[0].text, /Удалила/);
  assert.equal(app.memory.get(1, id), null);
  assert.ok(app.memory.list(2).length === 1);

  app.close();
});

test('разные люди не видят чужие записи, данные переживают закрытие базы', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimemi-keep-'));
  const file = path.join(dir, 'memory.sqlite');
  const db = openDatabase(file);
  const memory = createMemory(db, { timeZone: 'Europe/Moscow' });
  const saved = memory.save({ userId: 7, type: 'text', text: 'Личный конспект лекции' });
  memory.close();

  const again = createMemory(openDatabase(file), { timeZone: 'Europe/Moscow' });
  const handlers = createHandlers({ memory: again, timeZone: 'Europe/Moscow', now: () => now });
  assert.equal(again.get(7, saved.id).text, 'Личный конспект лекции');
  assert.equal(again.get(8, saved.id), null);
  handlers.handle(person(8, { text: ui.MENU.find }));
  const search = handlers.handle(person(8, { text: 'конспект лекции' }));
  assert.match(search.replies[0].text, /Пока не нашла/);
  handlers.handle(person(7, { text: ui.MENU.find }));
  const own = handlers.handle(person(7, { text: 'конспект лекции' }));
  assert.match(own.replies[0].text, /Личный конспект лекции/);
  again.close();
});

test('поиск по нескольким записям, страницы и пустые разделы', () => {
  const app = fresh();
  assert.match(app.handlers.handle(person(1, { text: ui.MENU.list })).replies[0].text, /Пока здесь пусто/);
  assert.match(app.handlers.handle(person(1, { text: ui.MENU.fav })).replies[0].text, /пока ничего нет/);

  for (let index = 1; index <= 6; index += 1) {
    app.memory.save({ userId: 1, type: 'text', text: `Учебная заметка номер ${index}` });
  }
  const first = app.handlers.handle(person(1, { text: ui.MENU.list }));
  assert.match(first.replies[0].text, /Учебная заметка номер 6/);
  assert.equal(first.replies[0].text.includes('номер 1'), false);
  assert.ok(callbacksOf(first.replies[0].markup).includes('ls:a:1'));

  const second = app.handlers.handle(person(1, { callback: 'ls:a:1' }));
  assert.match(second.replies[0].text, /номер 1/);
  assert.equal(second.replies[0].text.includes('номер 6'), false);

  app.handlers.handle(person(1, { text: ui.MENU.find }));
  const found = app.handlers.handle(person(1, { text: 'учебная заметка' }));
  assert.match(found.replies[0].text, /Нашла несколько/);
  app.close();
});

test('группа, ошибки и опасный текст не раскрывают секреты', () => {
  const app = fresh();
  const group = app.handlers.handle(person(1, { chatType: 'group', text: 'секретная заметка' }));
  assert.match(group.replies[0].text, /только в личном чате/);
  assert.equal(app.memory.list(1).length, 0);

  const broken = createHandlers({
    memory: {
      save() {
        throw new Error(`SQLITE_ERROR ${['bot999999', 'ABCDEFghijklmnopqrstuvwxyz123456'].join(':')}`);
      },
    },
  });
  const failed = broken.handle(person(1, { text: 'важная мысль' }));
  assert.match(failed.replies[0].text, /Что-то пошло не так/);
  assert.equal(failed.replies[0].text.includes('SQLITE'), false);
  assert.equal(failed.replies[0].text.includes('bot999999'), false);
  assert.equal(failed.replies[0].text.includes('ABCDEF'), false);

  const weird = app.handlers.handle(person(1, { text: '<b>секрет</b> & пароль' }));
  const id = Number(callbacksOf(weird.replies[0].markup)[0].split(':')[1]);
  const opened = app.handlers.handle(person(1, { callback: `open:${id}` }));
  assert.match(opened.replies[0].text, /&lt;b&gt;секрет&lt;\/b&gt; &amp; пароль/);

  const help = app.handlers.handle(person(1, { text: ui.MENU.help }));
  assert.match(help.replies[0].text, /только свои записи/);

  const bySlash = [
    ['/save', /Пришли то, что нужно запомнить/],
    ['/search', /Напиши обычными словами/],
    ['/notes', /Пока здесь пусто|Мои записи/],
    ['/favorites', /пока ничего нет|Избранное/],
    ['/help', /Как я могу помочь/],
    ['/menu', /Меню готово/],
  ];
  for (const [command, pattern] of bySlash) {
    assert.match(app.handlers.handle(person(1, { text: command })).replies[0].text, pattern);
  }

  const categories = app.handlers.handle(person(1, { text: '/categories' }));
  assert.match(categories.replies[0].text, /пока в планах/);
  assert.equal(categories.replies[0].text.includes('не знаю'), false);
  const remind = app.handlers.handle(person(1, { text: '/remind' }));
  assert.match(remind.replies[0].text, /пока в планах/);

  const names = ui.BOT_COMMANDS.map((item) => item.command);
  assert.deepEqual(names, ['start', 'save', 'search', 'notes', 'favorites', 'help', 'menu']);
  assert.equal(names.includes('categories'), false);
  assert.equal(names.includes('remind'), false);
  assert.equal(names.includes('stats'), false);
  assert.equal(names.includes('settings'), false);
  app.close();
});

test('чужой поисковый текст не обходит границу пользователя', () => {
  const app = fresh();
  app.memory.save({ userId: 1, type: 'text', text: 'тайная задача клиента' });
  const result = app.memory.search(2, `' OR 1=1 -- тайная задача`);
  assert.equal(result.items.length, 0);
  assert.equal(app.memory.remove(2, 1), false);
  app.close();
});
