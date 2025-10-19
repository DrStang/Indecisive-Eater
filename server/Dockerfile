# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --include=dev
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM tailscale/tailscale:latest

# Install Node.js
RUN apk add --no-cache nodejs npm netcat-openbsd

WORKDIR /app
ENV NODE_ENV=production

# Install production deps
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts

# Copy compiled output
COPY --from=build /app/dist ./dist

# Copy scripts
COPY start-tailscale.sh /start-tailscale.sh
COPY socks-proxy.js /socks-proxy.js
RUN chmod +x /start-tailscale.sh

EXPOSE 3001

CMD ["/start-tailscale.sh"]
