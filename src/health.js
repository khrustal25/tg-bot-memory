const http = require('http');

function startHealthServer() {
  const port = Number(process.env.PORT || 0);
  if (!Number.isInteger(port) || port <= 0) return null;

  const server = http.createServer((request, response) => {
    const url = String(request.url || '/').split('?')[0];
    if (request.method === 'GET' && (url === '/' || url === '/health')) {
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('ok');
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('not found');
  });

  server.on('error', () => {
    console.error('Не удалось открыть служебный порт. Бот всё равно продолжит ждать сообщения в Telegram.');
  });
  server.listen(port, '0.0.0.0');
  return server;
}

module.exports = { startHealthServer };
