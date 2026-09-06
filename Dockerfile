FROM node:20-slim

WORKDIR /app

COPY app/package*.json ./
RUN npm ci --omit=dev

COPY app/ ./

ENV HOST=0.0.0.0
ENV PORT=7860

EXPOSE 7860

CMD ["npm", "start"]
