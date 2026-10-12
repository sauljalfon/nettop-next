# Net-Top web image: the built frontend, served by unprivileged nginx on :8080.
#
# Build from frontend/:  docker build --platform linux/amd64 -t nettop-web:dev .
# The page calls /api on the same address; a reverse proxy (Traefik) sends
# /api to the API image and everything else here.

# ---- Stage 1: build (Node and the dev dependencies; thrown away) ----
FROM node:26.11.1-bookworm-slim AS build
WORKDIR /app
# Dependencies first, exactly as package-lock.json says.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Type-checks, then writes plain HTML, JS and CSS to dist/.
RUN npm run build

# ---- Stage 2: the image that runs (nginx and the built files only) ----
FROM nginxinc/nginx-unprivileged:1.29.8-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
