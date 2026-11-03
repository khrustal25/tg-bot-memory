const CATEGORIES = [
  {
    id: 'work',
    title: 'Работа',
    emoji: '💼',
    keywords: [
      'работ', 'проект', 'клиент', 'встреч', 'дедлайн', 'задач', 'офис', 'коллег',
      'зарплат', 'отчет', 'созвон', 'презентац', 'договор', 'бизнес', 'заказчик',
      'совеща', 'разработ',
    ],
  },
  {
    id: 'personal',
    title: 'Личное',
    emoji: '🏠',
    keywords: [
      'личн', 'семь', 'мама', 'маме', 'маму', 'мамой', 'папа', 'папе', 'папу', 'папой',
      'день рождения', 'здоров', 'врач', 'хобби', 'рецепт',
    ],
  },
  {
    id: 'ideas',
    title: 'Идеи',
    emoji: '💡',
    keywords: [
      'идея', 'идеи', 'идею', 'идее', 'идеей', 'придумал', 'придумала', 'замысел',
      'вдохнов', 'концепц', 'гипотез',
    ],
  },
  {
    id: 'study',
    title: 'Обучение',
    emoji: '📚',
    keywords: [
      'учеб', 'урок', 'курс', 'лекц', 'экзамен', 'универ', 'конспект', 'домашк',
      'семинар', 'диплом', 'школь', 'студент', 'обучен',
    ],
  },
  {
    id: 'shopping',
    title: 'Покупки',
    emoji: '🛒',
    keywords: [
      'купить', 'куплю', 'купила', 'купил', 'покуп', 'магазин', 'скидк', 'корзин',
      'товар', 'ozon', 'озон', 'wildberries', 'вайлдберриз', 'цена', 'цену', 'цены',
      'цене', 'ценник',
    ],
  },
];

const FALLBACK_CATEGORY = {
  id: 'other',
  title: 'Заметка',
  emoji: '📝',
  keywords: [],
};

const EXCEPTIONS = {
  курс: ['курсор', 'курсора', 'курсором', 'курсоре'],
};

const TYPE_LABELS = {
  text: 'заметка',
  link: 'ссылка',
  photo: 'фото',
  document: 'документ',
  voice: 'голосовое',
};

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordsOf(value) {
  return normalize(value).split(/[^a-z0-9а-я]+/).filter(Boolean);
}

function keywordMatches(text, words, keyword) {
  const key = normalize(keyword);
  if (!key) return false;
  if (key.includes(' ')) return text.includes(key);
  return words.some((word) => {
    if (!word.startsWith(key)) return false;
    const banned = EXCEPTIONS[key] || [];
    return !banned.includes(word);
  });
}

function getCategory(id) {
  return CATEGORIES.find((item) => item.id === id) || FALLBACK_CATEGORY;
}

function classify(value) {
  const text = normalize(value);
  const words = wordsOf(text);
  let bestId = FALLBACK_CATEGORY.id;
  let bestScore = 0;

  for (const category of CATEGORIES) {
    let score = 0;
    for (const keyword of category.keywords) {
      if (keywordMatches(text, words, keyword)) score += normalize(keyword).length;
    }
    if (score > 0 && category.id === 'ideas') score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestId = category.id;
    }
  }

  return bestId;
}

module.exports = {
  CATEGORIES,
  FALLBACK_CATEGORY,
  TYPE_LABELS,
  normalize,
  wordsOf,
  getCategory,
  classify,
};
