function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function redact(value) {
  return String(value ?? '')
    .replace(/bot\d{6,}:[A-Za-z0-9_-]+/gi, 'bot<скрыто>')
    .replace(/\d{6,}:[A-Za-z0-9_-]{20,}/g, '<скрыто>');
}

function cleanName(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 40);
}

module.exports = { escapeHtml, redact, cleanName };
