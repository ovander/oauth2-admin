# Build context = bff/. Static binary.
# Pinned to the exact patch release in go.mod's toolchain line; CI fails if the
# two drift (1.24 once silently fell behind — P3-25). The golang images set
# GOTOOLCHAIN=local, so this tag is the Go that compiles the shipped binary.
FROM golang:1.27.1-alpine AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/socrate-admin-bff .

# Distroless static, non-root.
FROM gcr.io/distroless/static:nonroot
COPY --from=build /out/socrate-admin-bff /usr/local/bin/socrate-admin-bff
USER nonroot:nonroot
EXPOSE 8091
ENTRYPOINT ["/usr/local/bin/socrate-admin-bff"]
