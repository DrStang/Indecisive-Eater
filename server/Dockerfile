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

# Install Tailscale
RUN apk add --no-cache ca-certificates iptables ip6tables iproute2 && \
    wget -qO- https://pkgs.tailscale.com/stable/tailscale_latest_$(uname -s)_$(uname -m).tgz | tar xzf - -C /usr/local/bin --strip-components=1

# install only prod deps for a slim image
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts

# bring compiled output
COPY --from=build /app/dist ./dist

# Copy startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 3001

CMD ["/start.sh"]
