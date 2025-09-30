# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app

# copy just manifest(s) first for better caching
COPY package.json package-lock.json* ./
# install WITH dev deps so TypeScript has @types/*
RUN npm install --include=dev

# now bring in the source and build
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
