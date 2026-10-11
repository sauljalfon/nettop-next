package main

import "errors"

// environment checks APP_ENV: the API refuses to start unless it is dev, test
// or prod, so a deployment can never run unlabeled.
func environment(value string) (string, error) {
	switch value {
	case "dev", "test", "prod":
		return value, nil
	}
	return "", errors.New("APP_ENV must be dev, test or prod")
}
