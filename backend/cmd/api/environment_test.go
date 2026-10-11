package main

import "testing"

// PR-04: the API refuses to start unless APP_ENV is dev, test or prod.
func TestPR04APPEnvMustBeDevTestOrProd(t *testing.T) {
	for _, ok := range []string{"dev", "test", "prod"} {
		got, err := environment(ok)
		if err != nil || got != ok {
			t.Errorf("environment(%q) = %q, %v; want it accepted", ok, got, err)
		}
	}
	for _, bad := range []string{"", "production", "Dev", "staging", " prod"} {
		_, err := environment(bad)
		if err == nil || err.Error() != "APP_ENV must be dev, test or prod" {
			t.Errorf("environment(%q) error = %v; want the APP_ENV message", bad, err)
		}
	}
}
