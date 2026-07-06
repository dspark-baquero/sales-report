FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# 콜드 스타트 가속용 데이터 스냅샷(data/snapshot.ndjson.gz). standalone은 임의
# 데이터 파일을 자동 포함하지 않으므로 명시적으로 복사. 없으면 런타임이 라이브 조회로 폴백.
COPY --from=builder /app/data ./data
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
