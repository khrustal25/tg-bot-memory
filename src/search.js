const { TYPE_LABELS, getCategory, normalize, wordsOf } = require('./categories');
const { extractRange } = require('./dates');

const STOP = new Set([
  'найди', 'найти', 'пожалуйста', 'меня', 'мне', 'мою', 'моя', 'мое', 'мой', 'мои',
  'которая', 'которую', 'которое', 'который', 'которые', 'это', 'эта', 'этот', 'эти',
  'для', 'что', 'как', 'где', 'когда', 'еще', 'было', 'была', 'был', 'были', 'про',
  'или', 'если', 'чтобы', 'просто', 'очень', 'вот', 'все', 'свой', 'своя', 'свою',
  'свои', 'сохраняла', 'сохранял', 'сохранила', 'сохранил', 'сохраненную',
  'информацию', 'информация', 'запись', 'записи', 'материал', 'материалы', 'хочу',
  'нужно', 'нужна', 'нужен', 'покажи', 'открой', 'есть', 'нет', 'на', 'по', 'из',
  'от', 'до', 'же', 'ли', 'бы', 'уже', 'только', 'можно', 'теперь', 'потом',
]);

const TYPE_WORDS = [
  ['link', ['ссылка', 'ссылку', 'ссылке', 'ссылки', 'ссылок']],
  ['photo', ['фото', 'фотографию', 'фотография', 'фотографии', 'картинку', 'картинка', 'скрин', 'скриншот', 'скриншота']],
  ['voice', ['голос', 'голосовое', 'голосовуха']],
  ['document', ['документ', 'документа', 'документы', 'файл', 'файла', 'файлы']],
  ['text', ['заметка', 'заметку', 'заметки', 'текст', 'текста']],
];

const DATE_WORDS = new Set([
  'сегодня', 'вчера', 'позавчера', 'прошлой', 'прошлая', 'прошлую', 'прошлый',
  'прошлом', 'прошлые', 'неделе', 'неделю', 'неделя', 'недели', 'недель', 'этой',
  'этом', 'месяце', 'месяц', 'месяца',
]);

function detectType(words) {
  for (const word of words) {
    for (const [type, variants] of TYPE_WORDS) {
      if (variants.some((variant) => word === variant || word.startsWith(variant))) return type;
    }
  }
  return null;
}

function isUsefulWord(word, type) {
  if (STOP.has(word) || DATE_WORDS.has(word)) return false;
  if (type) {
    for (const [, variants] of TYPE_WORDS) {
      if (variants.some((variant) => word === variant || word.startsWith(variant))) return false;
    }
  }
  if (/[a-z]/i.test(word) && word.length >= 2) return true;
  return word.length >= 4 || (word.length >= 3 && !STOP.has(word));
}

function parseQuery(query, now = new Date(), timeZone = 'Europe/Moscow') {
  const normalized = normalize(query).slice(0, 300);
  const words = wordsOf(normalized);
  const type = detectType(words);
  const range = extractRange(normalized, now, timeZone);
  const keywords = [];
  const seen = new Set();
  for (const word of words) {
    if (!isUsefulWord(word, type) || seen.has(word)) continue;
    seen.add(word);
    keywords.push(word);
  }
  return {
    type,
    from: range ? range.from : null,
    to: range ? range.to : null,
    words: keywords,
    empty: !type && !range && keywords.length === 0,
  };
}

function scoreItem(item, queryWords) {
  const hay = wordsOf([
    item.text,
    item.fileName,
    getCategory(item.category).title,
    TYPE_LABELS[item.type] || '',
  ].filter(Boolean).join(' '));
  let score = 0;
  for (const word of queryWords) {
    const prefix = word.length >= 6 ? word.slice(0, 5) : word;
    const hit = hay.some((candidate) => (
      candidate === word
      || candidate.startsWith(word)
      || (prefix.length >= 5 && candidate.startsWith(prefix))
    ));
    if (hit) score += 1;
  }
  return score;
}

module.exports = { parseQuery, scoreItem };
