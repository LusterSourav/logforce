package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRecoveryMiddleware(t *testing.T) {
	boom := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { panic("boom") })

	// page path panics become the 500 HTML page, process survives
	req := httptest.NewRequest("GET", "/dashboard-v2.html", nil)
	rec := httptest.NewRecorder()
	withRecovery(boom).ServeHTTP(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("page panic code=%d, want 500", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "text/html") {
		t.Fatalf("page panic content-type=%q, want html", ct)
	}

	// api path panics stay JSON so dashboard fetch parsing never breaks
	req2 := httptest.NewRequest("GET", "/api/classify", nil)
	rec2 := httptest.NewRecorder()
	withRecovery(boom).ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusInternalServerError {
		t.Fatalf("api panic code=%d, want 500", rec2.Code)
	}
	if ct := rec2.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
		t.Fatalf("api panic content-type=%q, want json", ct)
	}

	// healthy handlers pass through untouched
	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })
	rec3 := httptest.NewRecorder()
	withRecovery(ok).ServeHTTP(rec3, httptest.NewRequest("GET", "/", nil))
	if rec3.Code != 200 {
		t.Fatalf("passthrough code=%d, want 200", rec3.Code)
	}
}

func TestGuards(t *testing.T) {
	for _, p := range []string{"/ui/server.go", "/.env", "/.git/config", "/models/vocab.txt", "/output/x.ndjson", "/a.md", "/.x"} {
		if !isForbidden(p) {
			t.Errorf("isForbidden missed %q", p)
		}
	}
	for _, p := range []string{"/admin", "/login", "/login.html", "/wp-admin", "/wp-login.php", "/phpmyadmin/x"} {
		if !isUnauthorized(p) {
			t.Errorf("isUnauthorized missed %q", p)
		}
	}
	for _, p := range []string{"/", "/dashboard-v2.html", "/api/health", "/401", "/403", "/404", "/408", "/500", "/nope-xyz"} {
		if isForbidden(p) || isUnauthorized(p) {
			t.Errorf("guard overfires on %q", p)
		}
	}
}
