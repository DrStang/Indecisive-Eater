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
    wget https://tailscale.com/install.sh -O /tmp/install.sh && \
    sh /tmp/install.sh && \
    rm /tmp/install.sh

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
