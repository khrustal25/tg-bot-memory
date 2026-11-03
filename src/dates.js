function parts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const map = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: map.weekday,
  };
}

function offsetMs(date, timeZone) {
  const piece = parts(date, timeZone);
  const asUtc = Date.UTC(
    piece.year,
    piece.month - 1,
    piece.day,
    piece.hour,
    piece.minute,
    piece.second,
  );
  return asUtc - date.getTime();
}

function zonedToUtc(year, month, day, hour, minute, second, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = guess - offsetMs(new Date(guess), timeZone);
  return new Date(guess - offsetMs(new Date(first), timeZone));
}

function startOfDay(date, timeZone) {
  const piece = parts(date, timeZone);
  return zonedToUtc(piece.year, piece.month, piece.day, 0, 0, 0, timeZone);
}

function addDays(date, days, timeZone) {
  const piece = parts(date, timeZone);
  const shifted = new Date(Date.UTC(piece.year, piece.month - 1, piece.day + days));
  return zonedToUtc(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    0,
    0,
    0,
    timeZone,
  );
}

function startOfMonth(date, timeZone) {
  const piece = parts(date, timeZone);
  return zonedToUtc(piece.year, piece.month, 1, 0, 0, 0, timeZone);
}

function addMonths(date, months, timeZone) {
  const piece = parts(date, timeZone);
  const shifted = new Date(Date.UTC(piece.year, piece.month - 1 + months, 1));
  return zonedToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1, 0, 0, 0, timeZone);
}

const WEEKDAY = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function startOfWeek(date, timeZone) {
  const piece = parts(date, timeZone);
  const index = WEEKDAY[piece.weekday] ?? 0;
  return addDays(date, -index, timeZone);
}

function extractRange(normalized, now, timeZone) {
  const text = String(normalized || '');
  if (text.includes('позавчера')) {
    const from = addDays(now, -2, timeZone);
    return { from: from.toISOString(), to: addDays(now, -1, timeZone).toISOString() };
  }
  if (text.includes('вчера')) {
    const from = addDays(now, -1, timeZone);
    return { from: from.toISOString(), to: startOfDay(now, timeZone).toISOString() };
  }
  if (text.includes('сегодня')) {
    const from = startOfDay(now, timeZone);
    return { from: from.toISOString(), to: addDays(now, 1, timeZone).toISOString() };
  }
  if (/прошл\p{L}*\s+недел/u.test(text)) {
    const thisWeek = startOfWeek(now, timeZone);
    const previous = addDays(thisWeek, -7, timeZone);
    return { from: previous.toISOString(), to: thisWeek.toISOString() };
  }
  if (/эт\p{L}*\s+недел/u.test(text)) {
    const thisWeek = startOfWeek(now, timeZone);
    return { from: thisWeek.toISOString(), to: addDays(thisWeek, 7, timeZone).toISOString() };
  }
  if (/прошл\p{L}*\s+месяц/u.test(text)) {
    const thisMonth = startOfMonth(now, timeZone);
    return { from: addMonths(now, -1, timeZone).toISOString(), to: thisMonth.toISOString() };
  }
  if (/эт\p{L}*\s+месяц/u.test(text)) {
    const thisMonth = startOfMonth(now, timeZone);
    return { from: thisMonth.toISOString(), to: addMonths(now, 1, timeZone).toISOString() };
  }
  return null;
}

function formatDate(iso, timeZone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso || '');
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

module.exports = { extractRange, formatDate, startOfDay, addDays };
