//go:build !windows

package docudocu

import "os"

func replaceReviewStateFile(source, destination string) error {
	return os.Rename(source, destination)
}
