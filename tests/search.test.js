const test = require('node:test');
const assert = require('node:assert/strict');
const { extractRange } = require('../src/dates');
const { parseQuery } = require('../src/search');

const zone = 'Europe/Moscow';
const now = new Date('2026-11-02T12:00:00+03:00');

test('понимает вчера, сегодня и прошлую неделю', () => {
  const lastWeek = extractRange('найди на прошлой неделе', now, zone);
  assert.equal(new Date(lastWeek.from).getTime(), new Date('2026-10-26T00:00:00+03:00').getTime());
  assert.equal(new Date(lastWeek.to).getTime(), new Date('2026-11-02T00:00:00+03:00').getTime());

  const yesterday = extractRange('вчера', now, zone);
  assert.equal(new Date(yesterday.from).getTime(), new Date('2026-11-01T00:00:00+03:00').getTime());
  assert.equal(new Date(yesterday.to).getTime(), new Date('2026-11-02T00:00:00+03:00').getTime());

  const before = extractRange('позавчера', now, zone);
  assert.equal(new Date(before.from).getTime(), new Date('2026-10-31T00:00:00+03:00').getTime());
  assert.ok(new Date(before.to).getTime() < new Date(yesterday.from).getTime() + 1);
});

test('вынимает смысл из обычного запроса', () => {
  const parsed = parseQuery(
    'Найди ссылку на сервис для создания AI-видео, которую я сохраняла на прошлой неделе',
    now,
    zone,
  );
  assert.equal(parsed.type, 'link');
  assert.ok(parsed.from);
  assert.ok(parsed.words.includes('сервис'));
  assert.ok(parsed.words.includes('видео'));
  assert.equal(parsed.words.includes('найди'), false);
  assert.equal(parsed.words.includes('которую'), false);
  assert.equal(parsed.empty, false);
});

test('пустой поиск просит уточнить запрос', () => {
  const parsed = parseQuery('найди пожалуйста', now, zone);
  assert.equal(parsed.empty, true);
});
