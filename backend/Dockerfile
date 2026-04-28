FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner

# 中文字体（WenQuanYi Zen Hei，包含 CJK 全字符集），PI / 报价单等 PDF
# 生成需要它来正确渲染中文，不装会出乱码方块。
RUN apk add --no-cache openssl font-wqy-zenhei

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
# 项目自带的中文字体（assets/fonts/wqy-microhei.ttc），用于 PI / 报价
# PDF 渲染中文。哪怕 base 镜像没装系统字体，这里也能用。
COPY --from=builder /app/assets ./assets

RUN mkdir -p /app/uploads

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
