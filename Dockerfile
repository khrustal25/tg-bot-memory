# AIMEMI — Telegram-бот на polling.
# Язык: Node.js. Точка входа: index.js (npm start → node index.js).
# Токен в образ не вшивается — только переменная окружения TELEGRAM_BOT_TOKEN.

FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js ./
COPY src ./src
COPY data/.gitkeep ./data/

RUN mkdir -p /app/data \
  && chown -R node:node /app

USER node

# Timeweb передаёт PORT; служебный /health слушает 0.0.0.0, если PORT задан.
EXPOSE 3000

CMD ["node", "index.js"]
