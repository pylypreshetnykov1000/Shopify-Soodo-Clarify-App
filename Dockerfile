FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --include=dev

COPY . .

RUN DATABASE_URL=postgresql://unused:unused@127.0.0.1:5432/build_only npm run db:postgres:generate && npm run build
RUN npm prune --omit=dev

CMD ["npm", "run", "docker-start"]
