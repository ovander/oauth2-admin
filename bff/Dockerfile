# Build context = bff/. Stdlib only → static binary, no go.sum needed.
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/socrate-admin-bff .

# Distroless static, non-root.
FROM gcr.io/distroless/static:nonroot
COPY --from=build /out/socrate-admin-bff /usr/local/bin/socrate-admin-bff
USER nonroot:nonroot
EXPOSE 8091
ENTRYPOINT ["/usr/local/bin/socrate-admin-bff"]
