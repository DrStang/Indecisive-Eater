 # ---------- build ----------
# build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --include=dev        # <— dev deps for tsc
COPY . .
RUN npm run build
# ---------- runtime ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# install only prod deps for a slim image
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts
# bring compiled output
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["node","dist/index.js"]
