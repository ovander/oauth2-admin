package main

import (
	"sync"
	"time"
)

// UserInfo is the identity surfaced to the SPA via /bff/session. It is derived
// from the token response + the access-token claims; never the raw tokens.
type UserInfo struct {
	Sub   string   `json:"sub"`
	Email string   `json:"email"`
	Name  string   `json:"name"`
	Roles []string `json:"roles"`
}

// Session is server-side state for one logged-in admin. The tokens never leave
// the BFF; the browser holds only the opaque session id (the cookie value).
//
// All field access is guarded by mu so concurrent requests for the same session
// (e.g. an SSE stream alongside API calls, or a proactive token refresh) are
// race-free.
type Session struct {
	mu sync.Mutex

	ID           string
	AccessToken  string
	RefreshToken string
	IDToken      string
	AccessExpiry time.Time
	CSRF         string
	Created      time.Time
	LastSeen     time.Time
	User         UserInfo
}

// SessionStore persists sessions. The in-memory implementation below is the
// default; a Postgres-backed store can implement the same interface later
// (Sweep becomes a DELETE … WHERE expired).
type SessionStore interface {
	Get(id string) (*Session, bool)
	Put(s *Session)
	Delete(id string)
	Sweep()
}

// memStore is a mutex-guarded in-memory SessionStore. Expiry is a sliding idle
// window OR an absolute lifetime, enforced lazily on read and by Sweep.
type memStore struct {
	mu       sync.Mutex
	sessions map[string]*Session
	idle     time.Duration
	absolute time.Duration
}

func newMemStore(idle, absolute time.Duration) *memStore {
	return &memStore{sessions: make(map[string]*Session), idle: idle, absolute: absolute}
}

func (m *memStore) expired(s *Session) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	return now.Sub(s.LastSeen) > m.idle || now.Sub(s.Created) > m.absolute
}

func (m *memStore) Get(id string) (*Session, bool) {
	m.mu.Lock()
	s, ok := m.sessions[id]
	m.mu.Unlock()
	if !ok {
		return nil, false
	}
	if m.expired(s) {
		m.Delete(id)
		return nil, false
	}
	return s, true
}

func (m *memStore) Put(s *Session) {
	m.mu.Lock()
	m.sessions[s.ID] = s
	m.mu.Unlock()
}

func (m *memStore) Delete(id string) {
	m.mu.Lock()
	delete(m.sessions, id)
	m.mu.Unlock()
}

func (m *memStore) Sweep() {
	m.mu.Lock()
	snapshot := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		snapshot = append(snapshot, s)
	}
	m.mu.Unlock()

	var dead []string
	for _, s := range snapshot {
		if m.expired(s) {
			dead = append(dead, s.ID)
		}
	}
	if len(dead) > 0 {
		m.mu.Lock()
		for _, id := range dead {
			delete(m.sessions, id)
		}
		m.mu.Unlock()
	}
}
