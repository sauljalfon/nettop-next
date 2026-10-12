# Net-Top API image: /app/api (the server) and /app/db (migrate, init, seed).
#
# Build from backend/:  docker build --platform linux/amd64 -t nettop-api:dev .
# Run:  APP_ENV (dev, test or prod) and DATABASE_URL are given at run time,
#       never baked in. A new database needs `/app/db migrate`, then
#       `/app/db init`; `/app/db seed` is development data only.

# ---- Stage 1: build (has the Go toolchain; thrown away) ----
FROM golang:1.26.4-bookworm AS build
WORKDIR /src
# Dependencies first, so a code change does not download them again.
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Static Linux binaries, without local paths or debug symbols.
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api \
 && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/db ./cmd/db

# ---- Stage 2: the image that runs (only the two binaries) ----
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /out/db /app/
# The API's default (127.0.0.1:8080) cannot be reached from outside a container.
ENV HTTP_ADDR=:8080
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/api"]
