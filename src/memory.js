const { classify } = require('./categories');
const { parseQuery, scoreItem } = require('./search');

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    type: row.type,
    text: row.text || '',
    fileId: row.file_id || null,
    fileName: row.file_name || null,
    category: row.category,
    isFavorite: Number(row.is_favorite) === 1,
    createdAt: row.created_at,
  };
}

function createMemory(db, options = {}) {
  const timeZone = options.timeZone || 'Europe/Moscow';
  const insert = db.prepare(`
    INSERT INTO items (user_id, type, text, file_id, file_name, category, is_favorite, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `);
  const selectOne = db.prepare('SELECT * FROM items WHERE user_id = ? AND id = ?');
  const selectAll = db.prepare(`
    SELECT * FROM items
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 500
  `);
  const selectFavorite = db.prepare(`
    SELECT * FROM items
    WHERE user_id = ? AND is_favorite = 1
    ORDER BY created_at DESC, id DESC
    LIMIT 500
  `);
  const selectCategory = db.prepare(`
    SELECT * FROM items
    WHERE user_id = ? AND category = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 500
  `);
  const selectFiltered = db.prepare(`
    SELECT * FROM items
    WHERE user_id = ?
      AND (? IS NULL OR type = ?)
      AND (? IS NULL OR created_at >= ?)
      AND (? IS NULL OR created_at < ?)
    ORDER BY created_at DESC, id DESC
    LIMIT 500
  `);
  const updateFavorite = db.prepare('UPDATE items SET is_favorite = ? WHERE user_id = ? AND id = ?');
  const updateCategory = db.prepare('UPDATE items SET category = ? WHERE user_id = ? AND id = ?');
  const updateText = db.prepare(`
    UPDATE items
    SET text = ?, type = ?, category = ?
    WHERE user_id = ? AND id = ?
  `);
  const removeOne = db.prepare('DELETE FROM items WHERE user_id = ? AND id = ?');

  function requireUser(userId) {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) throw new Error('Некорректный пользователь');
    return id;
  }

  function get(userId, itemId) {
    return mapRow(selectOne.get(requireUser(userId), Number(itemId)));
  }

  return {
    save(input) {
      const userId = requireUser(input.userId);
      const text = String(input.text || '').slice(0, 4000);
      const fileName = input.fileName ? String(input.fileName).slice(0, 200) : null;
      const fileId = input.fileId ? String(input.fileId).slice(0, 512) : null;
      const type = input.type || 'text';
      const category = classify(`${text}\n${fileName || ''}`);
      const createdAt = input.createdAt || new Date().toISOString();
      const result = insert.run(userId, type, text, fileId, fileName, category, createdAt);
      return get(userId, Number(result.lastInsertRowid));
    },

    get,

    list(userId, filter = {}) {
      const id = requireUser(userId);
      if (filter.favorites) return selectFavorite.all(id).map(mapRow);
      if (filter.category) return selectCategory.all(id, filter.category).map(mapRow);
      return selectAll.all(id).map(mapRow);
    },

    search(userId, query, now = new Date()) {
      const id = requireUser(userId);
      const parsed = parseQuery(query, now, timeZone);
      if (parsed.empty) return { status: 'empty', items: [] };
      const rows = selectFiltered.all(
        id,
        parsed.type,
        parsed.type,
        parsed.from,
        parsed.from,
        parsed.to,
        parsed.to,
      ).map(mapRow);
      if (parsed.words.length === 0) {
        return { status: rows.length ? 'ok' : 'none', items: rows.slice(0, 20) };
      }
      const ranked = rows
        .map((item) => ({ item, score: scoreItem(item, parsed.words) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || (a.item.createdAt < b.item.createdAt ? 1 : -1));
      return {
        status: ranked.length ? 'ok' : 'none',
        items: ranked.slice(0, 20).map((entry) => entry.item),
      };
    },

    toggleFavorite(userId, itemId) {
      const current = get(userId, itemId);
      if (!current) return null;
      updateFavorite.run(current.isFavorite ? 0 : 1, current.userId, current.id);
      return get(userId, itemId);
    },

    setCategory(userId, itemId, categoryId) {
      const allowed = ['work', 'personal', 'ideas', 'study', 'shopping', 'other'];
      if (!allowed.includes(categoryId)) return null;
      const current = get(userId, itemId);
      if (!current) return null;
      updateCategory.run(categoryId, current.userId, current.id);
      return get(userId, itemId);
    },

    update(userId, itemId, patch = {}) {
      const current = get(userId, itemId);
      if (!current) return null;
      const text = String(patch.text ?? current.text).slice(0, 4000);
      let type = current.type;
      if (type === 'text' || type === 'link') {
        type = /https?:\/\/[^\s<>"']+/i.test(text) ? 'link' : 'text';
      }
      const category = classify(`${text}\n${current.fileName || ''}`);
      updateText.run(text, type, category, current.userId, current.id);
      return get(userId, itemId);
    },

    remove(userId, itemId) {
      const result = removeOne.run(requireUser(userId), Number(itemId));
      return Number(result.changes) > 0;
    },

    close() {
      db.close();
    },
  };
}

module.exports = { createMemory };
