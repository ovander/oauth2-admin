module github.com/ovander/oauth2-admin/bff

// The Go that builds, tests and ships this BFF: the language minimum, the
// GODEBUG defaults and, with no toolchain line, the toolchain (GOTOOLCHAIN=auto
// fetches it). CI reads this line (go-version-file) and fails if it or
// bff/Dockerfile's golang image drift apart.
go 1.27.1

require github.com/ovander/backendkit v1.15.0

require (
	github.com/google/uuid v1.6.0 // indirect
	github.com/sirupsen/logrus v1.9.3 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
)
