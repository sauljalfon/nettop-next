// Package dotenv loads the repository's .env file for local commands and tests.
//
// It looks for .env in the working directory and its parents (so `go test`,
// which runs in each package directory, finds the file at the repository root),
// and sets only variables that are not already in the environment: a real
// environment variable always wins. A missing file is not an error.
package dotenv

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// Load loads the nearest .env from the working directory upward.
func Load() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	return LoadFrom(dir)
}

// LoadFrom loads the nearest .env from dir upward and returns its path, or ""
// when there is none.
func LoadFrom(dir string) (string, error) {
	for {
		path := filepath.Join(dir, ".env")
		data, err := os.ReadFile(path)
		if err == nil {
			values, err := parse(data)
			if err != nil {
				return path, fmt.Errorf("%s: %w", path, err)
			}
			for k, v := range values {
				if _, set := os.LookupEnv(k); !set {
					os.Setenv(k, v)
				}
			}
			return path, nil
		}
		if !errors.Is(err, fs.ErrNotExist) {
			return path, err
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", nil
		}
		dir = parent
	}
}

// parse reads KEY=VALUE lines. Blank lines and lines starting with # are
// skipped, an optional "export " prefix is allowed, and a value wrapped in
// single or double quotes is taken literally.
func parse(data []byte) (map[string]string, error) {
	values := map[string]string{}
	for i, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, value, ok := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		if !ok || key == "" {
			return nil, fmt.Errorf("line %d: expected KEY=VALUE", i+1)
		}
		value = strings.TrimSpace(value)
		if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[len(value)-1] == value[0] {
			value = value[1 : len(value)-1]
		}
		values[key] = value
	}
	return values, nil
}
