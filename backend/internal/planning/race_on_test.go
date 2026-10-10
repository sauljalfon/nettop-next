//go:build race

package planning_test

// The race detector slows this CPU-bound check about six-fold.
const raceSlowdown = 6
