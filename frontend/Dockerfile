# syntax=docker/dockerfile:1
# The web app, built and served by Nginx, which also forwards /api and /admin to the API.
# Build context: frontend/

FROM node:24.22-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY . .
RUN npm run build

# Runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.30-alpine3.24
# Pick up Alpine security fixes released after the base image was built (e.g. curl); the base
# image runs as the unprivileged nginx user, so switch to root for this and back afterwards.
USER root
RUN apk upgrade --no-cache
USER 101
# API_UPSTREAM is substituted into the config at start-up (nginx's envsubst templates), and so is
# NGINX_LOCAL_RESOLVERS, which the image's entrypoint reads from /etc/resolv.conf when asked to.
ENV API_UPSTREAM=http://api:8000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/healthz"]
