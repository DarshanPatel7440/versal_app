FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 8590

CMD ["node", "src/index.js"]
