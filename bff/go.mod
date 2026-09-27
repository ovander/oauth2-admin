module github.com/ovander/oauth2-admin/bff

go 1.25.0

// The Go that builds, tests and ships this BFF. Go 1.25 is out of support
// since Go 1.27's release. CI reads this line (go-version-file) and fails if
// it or bff/Dockerfile's golang image drift apart.
toolchain go1.26.8

require github.com/ovander/backendkit v1.12.0

require (
	github.com/google/uuid v1.6.0 // indirect
	github.com/sirupsen/logrus v1.9.3 // indirect
	golang.org/x/sync v0.21.0 // indirect
	golang.org/x/sys v0.28.0 // indirect
)
