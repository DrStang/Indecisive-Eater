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
RUN apk add --no-cache nodejs npm netcat-openbsd socat

WORKDIR /app
ENV NODE_ENV=production

# Copy package files and install deps
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts && npm install socks

# Copy compiled output
COPY --from=build /app/dist ./dist

# Copy proxy script as .cjs
COPY socks-proxy.cjs ./socks-proxy.cjs

# Copy startup script
COPY start-tailscale.sh /start-tailscale.sh
RUN chmod +x /start-tailscale.sh

EXPOSE 3001

CMD ["/start-tailscale.sh"]
