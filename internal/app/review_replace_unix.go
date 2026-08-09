//go:build !windows

package toudocu

import "os"

func replaceReviewStateFile(source, destination string) error {
	return os.Rename(source, destination)
}
