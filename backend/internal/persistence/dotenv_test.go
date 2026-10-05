package persistence

import "nettop.local/backend/internal/dotenv"

// Database tests read TEST_DATABASE_URL; the repository's .env provides it
// unless the environment already does.
func init() {
	if _, err := dotenv.Load(); err != nil {
		panic(err)
	}
}
