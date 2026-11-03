const { TYPE_LABELS, getCategory } = require('./categories');
const { formatDate } = require('./dates');
const { escapeHtml, cleanName } = require('./safe');

const PAGE_SIZE = 5;

const MENU = {
  save: '💾 Сохранить',
  find: '🔎 Найти',
  list: '📂 Мои записи',
  fav: '⭐ Избранное',
  help: '❓ Помощь',
};

const BOT_COMMANDS = [
  { command: 'start', description: 'Начать' },
  { command: 'save', description: 'Сохранить' },
  { command: 'search', description: 'Найти' },
  { command: 'notes', description: 'Мои записи' },
  { command: 'favorites', description: 'Избранное' },
  { command: 'help', description: 'Помощь' },
  { command: 'menu', description: 'Меню' },
];

const COMMAND_ALIASES = {
  '/start': 'start',
  '/help': 'help',
  '/menu': 'menu',
  '/save': 'save',
  '/search': 'find',
  '/find': 'find',
  '/notes': 'list',
  '/list': 'list',
  '/favorites': 'fav',
  '/favourite': 'fav',
  '/favorite': 'fav',
  '/fav': 'fav',
};

function hasUrl(text) {
  return /https?:\/\/[^\s<>"']+/i.test(String(text || ''));
}

function commandOf(text) {
  const first = String(text || '').trim().split(/\s+/)[0].toLowerCase();
  if (!first.startsWith('/')) return null;
  const name = first.split('@')[0];
  if (COMMAND_ALIASES[name]) return COMMAND_ALIASES[name];
  return 'unknown';
}

function reply(text, markup) {
  return { kind: 'text', text, markup };
}

function mainKeyboard() {
  return {
    keyboard: [
      [{ text: MENU.save }, { text: MENU.find }],
      [{ text: MENU.list }, { text: MENU.fav }],
      [{ text: MENU.help }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

function startKeyboard() {
  return {
    inline_keyboard: [[{ text: '🚀 Начать', callback_data: 'start' }]],
  };
}

function savedKeyboard(item) {
  return {
    inline_keyboard: [
      [{ text: item.isFavorite ? '💛 Убрать из избранного' : '⭐ В избранное', callback_data: `fav:${item.id}` }],
    ],
  };
}

function cardKeyboard(item) {
  return {
    inline_keyboard: [
      [{ text: item.isFavorite ? '💛 Убрать из избранного' : '⭐ В избранное', callback_data: `fav:${item.id}` }],
      [{ text: '✏️ Редактировать', callback_data: `edit:${item.id}` }],
      [{ text: '🗑 Удалить', callback_data: `askdel:${item.id}` }],
      [{ text: '⬅️ К списку', callback_data: 'back' }],
    ],
  };
}

function editKeyboard(itemId) {
  return {
    inline_keyboard: [[{ text: 'Отмена', callback_data: `open:${itemId}` }]],
  };
}

function deleteKeyboard(itemId) {
  return {
    inline_keyboard: [[
      { text: 'Да, удалить', callback_data: `del:${itemId}` },
      { text: 'Оставить', callback_data: `open:${itemId}` },
    ]],
  };
}

function listCallback(browse, page) {
  if (browse.kind === 'fav') return `ls:f:${page}`;
  if (browse.kind === 'search') return `ls:s:${page}`;
  return `ls:a:${page}`;
}

function plainSnippet(item) {
  const source = item.text || item.fileName || fallbackText(item);
  const oneLine = String(source).replace(/\s+/g, ' ').trim();
  return oneLine.length > 40 ? `${oneLine.slice(0, 39)}…` : oneLine;
}

function listKeyboard(items, page, pages, browse) {
  const rows = items.map((item, index) => {
    const category = getCategory(item.category);
    const number = page * PAGE_SIZE + index + 1;
    const label = `${number}. ${category.emoji} ${plainSnippet(item)}`.slice(0, 60);
    return [{ text: label, callback_data: `open:${item.id}` }];
  });
  const navigation = [];
  if (page > 0) navigation.push({ text: '◀️', callback_data: listCallback(browse, page - 1) });
  if (page < pages - 1) navigation.push({ text: '▶️', callback_data: listCallback(browse, page + 1) });
  if (navigation.length) rows.push(navigation);
  if (browse.kind === 'all') {
    rows.push([{ text: '⭐ Избранное', callback_data: 'ls:f:0' }]);
  } else if (browse.kind === 'fav') {
    rows.push([{ text: '📂 Мои записи', callback_data: 'ls:a:0' }]);
  }
  return { inline_keyboard: rows };
}

function fallbackText(item) {
  if (item.type === 'photo') return 'Фотография';
  if (item.type === 'voice') return 'Голосовое сообщение';
  if (item.type === 'document') return item.fileName || 'Документ';
  if (item.type === 'link') return 'Ссылка';
  return 'Заметка';
}

function welcome(firstName) {
  const name = cleanName(firstName);
  const hello = name ? `Привет, ${escapeHtml(name)}!` : 'Привет!';
  return [
    `💜 <b>${hello}</b>`,
    'Я AIMEMI — твоя вторая память.',
    '',
    'Сохраняю заметки, ссылки, фото, документы и голосовые. Сама раскладываю их по темам и быстро нахожу, когда попросишь обычными словами.',
    '',
    'Нажми «🚀 Начать», и я покажу меню.',
  ].join('\n');
}

function menuIntro() {
  return [
    '✨ Меню готово.',
    '',
    'Можешь сразу прислать текст, ссылку, фото, документ или голосовое — я запомню.',
    'Или выбери кнопку внизу.',
  ].join('\n');
}

function savePrompt() {
  return '💾 Пришли то, что нужно запомнить: текст, ссылку, фото, документ или голосовое.';
}

function findPrompt() {
  return [
    '🔎 Напиши обычными словами, что найти.',
    '',
    'Например: «ссылка на сервис для AI-видео, которую я сохраняла на прошлой неделе».',
    '',
    'Чтобы выйти из поиска, напиши «Отмена» или нажми другую кнопку меню.',
  ].join('\n');
}

function saved(item) {
  const category = getCategory(item.category);
  const lines = [
    '✅ Готово! Запомнила и сохранила!',
    '',
  ];
  if (category.id === 'other') {
    lines.push('Информация сохранена.');
  } else {
    lines.push(`Информация сохранена в категорию «${category.title}».`);
  }
  if (/напомн/i.test(item.text || '')) {
    lines.push('', 'Напоминания появятся позже. Пока я просто бережно храню этот текст, чтобы он не потерялся.');
  }
  lines.push('', 'Если нужно, добавь в избранное.');
  return lines.join('\n');
}

function card(item, timeZone, intro) {
  const category = getCategory(item.category);
  const body = escapeHtml(item.text || fallbackText(item));
  const lines = [];
  if (intro) lines.push(intro, '');
  lines.push(`${category.emoji} <b>${escapeHtml(category.title)}</b>`);
  lines.push(escapeHtml(formatDate(item.createdAt, timeZone)));
  lines.push(`Тип: ${escapeHtml(TYPE_LABELS[item.type] || 'запись')}`);
  lines.push('', body);
  if (item.fileName) lines.push('', `Файл: ${escapeHtml(item.fileName)}`);
  lines.push('', item.isFavorite ? '⭐ В избранном' : '☆ Пока не в избранном');
  return lines.join('\n');
}

function media(item) {
  const category = getCategory(item.category);
  return {
    kind: item.type,
    fileId: item.fileId,
    caption: `${category.emoji} ${category.title}`,
  };
}

function listText(title, items, page) {
  const lines = [title, ''];
  items.forEach((item, index) => {
    const category = getCategory(item.category);
    const number = page * PAGE_SIZE + index + 1;
    lines.push(`${number}. ${category.emoji} ${escapeHtml(plainSnippet(item))}`);
  });
  lines.push('', 'Нажми на запись, чтобы открыть, отредактировать или удалить.');
  return lines.join('\n');
}

function helpText() {
  return [
    '❓ <b>Как я могу помочь</b>',
    '',
    '💾 Пришли текст, ссылку, фото, документ или голосовое — я всё запомню.',
    '🔎 Нажми «Найти» и опиши, что нужно. Можно добавить «вчера» или «на прошлой неделе».',
    '📂 В «Моих записях» можно открыть, отредактировать, добавить в избранное или удалить.',
    '⭐ Избранное собирает то, что ты отметила звёздочкой.',
    '',
    'Каждый человек видит только свои записи. Я не показываю их никому другому.',
  ].join('\n');
}

function searchListTitle(count) {
  return [
    '🔎 Сейчас поищу в твоих воспоминаниях...',
    '',
    `🧠 Нашла несколько записей: ${count}. Выбери нужную.`,
  ].join('\n');
}

function foundOne() {
  return [
    '🔎 Сейчас поищу в твоих воспоминаниях...',
    '',
    '🧠 Нашла! Кажется, это именно то, что ты искала!',
  ].join('\n');
}

function nothingFound() {
  return [
    '🔎 Сейчас поищу в твоих воспоминаниях...',
    '',
    'Пока не нашла такого. Попробуй другими словами: темой, частью ссылки или «вчера».',
  ].join('\n');
}

function allTitle(count) {
  return `📂 <b>Мои записи</b>\nВсего: ${count}`;
}

function favTitle(count) {
  return `⭐ <b>Избранное</b>\nВсего: ${count}`;
}

module.exports = {
  PAGE_SIZE,
  MENU,
  BOT_COMMANDS,
  hasUrl,
  commandOf,
  reply,
  mainKeyboard,
  startKeyboard,
  savedKeyboard,
  cardKeyboard,
  editKeyboard,
  deleteKeyboard,
  listKeyboard,
  welcome,
  menuIntro,
  savePrompt,
  findPrompt,
  saved,
  card,
  media,
  listText,
  helpText,
  searchListTitle,
  foundOne,
  nothingFound,
  allTitle,
  favTitle,
  privateOnly: () => 'Я общаюсь только в личном чате, чтобы твои записи никто больше не увидел. Напиши мне напрямую.',
  unknown: () => 'Этот пункт меню пока недоступен. Выбери кнопку внизу или открой меню заново через /menu.',
  laterFeature: () => 'Этот пункт пока в планах. Пока можно сохранять, искать, смотреть записи и избранное 💜',
  searchCancelled: () => 'Хорошо, поиск закрыла. Меню на месте 💜',
  unsupported: () => 'Пока я умею запоминать текст, ссылки, фото, документы и голосовые. Пришли, пожалуйста, что-нибудь из этого 💜',
  empty: () => 'Кажется, сообщение пустое. Пришли текст или файл, и я его запомню.',
  hint: () => 'Я рядом. Пришли заметку или выбери кнопку внизу: сохранить, найти или открыть записи.',
  genericError: () => 'Что-то пошло не так. Уже сохранённое осталось на месте. Попробуй ещё раз чуть позже.',
  missing: () => 'Не нашла эту запись. Возможно, она уже удалена.',
  staleButton: () => 'Эта кнопка уже не работает. Открой меню и выбери действие ещё раз.',
  allEmpty: () => 'Пока здесь пусто. Пришли заметку, ссылку или файл — и я сразу разложу её по полочкам.',
  favEmpty: () => 'В избранном пока ничего нет. Открой запись и нажми звёздочку, если хочешь вернуться к ней быстрее.',
  addedFav: () => 'Добавила в избранное ⭐',
  removedFav: () => 'Убрала из избранного.',
  editPrompt: () => [
    '✏️ Пришли новый текст для этой записи.',
    '',
    'Файл, фото или голосовое останутся на месте — поменяется только текст.',
    'Чтобы выйти без изменений, нажми «Отмена» или напиши «Отмена».',
  ].join('\n'),
  edited: () => 'Обновила запись ✏️',
  editNeedText: () => 'Для редактирования пришли именно текст. Или нажми «Отмена».',
  confirmDelete: () => 'Удалить эту запись? Вернуть её потом не получится.',
  deleted: () => 'Удалила. Если это было лишнее — хорошо, что место стало свободнее.',
  fileUnavailable: () => 'Запись на месте, но сам файл сейчас не открывается. Попробуй ещё раз чуть позже.',
};
