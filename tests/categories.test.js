const test = require('node:test');
const assert = require('node:assert/strict');
const { classify } = require('../src/categories');

test('раскладывает записи по понятным категориям', () => {
  const cases = [
    ['Встреча с клиентом в понедельник по проекту', 'work'],
    ['Годовой отчёт для офиса', 'work'],
    ['Договор с заказчиком', 'work'],
    ['Рецепт мамы на день рождения', 'personal'],
    ['Идея для нового ролика', 'ideas'],
    ['Идея подарка маме', 'ideas'],
    ['Конспект лекции и домашка по курсу', 'study'],
    ['Курс по истории', 'study'],
    ['Купить молоко и хлеб со скидкой', 'shopping'],
    ['https://www.ozon.ru/product/123', 'shopping'],
    ['Курсор скачать', 'other'],
    ['Просто привет, как настроение', 'other'],
    ['', 'other'],
  ];

  for (const [text, category] of cases) {
    assert.equal(classify(text), category, text);
  }
});
