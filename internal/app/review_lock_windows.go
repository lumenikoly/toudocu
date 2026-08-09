//go:build windows

package docudocu

import (
	"errors"
	"os"
	"syscall"
	"unsafe"
)

const (
	reviewLockExclusive       = 0x00000002
	reviewLockFailImmediately = 0x00000001
	reviewErrorLockViolation  = syscall.Errno(33)
	reviewErrorSharing        = syscall.Errno(32)
)

var (
	reviewKernel32     = syscall.NewLazyDLL("kernel32.dll")
	reviewLockFileEx   = reviewKernel32.NewProc("LockFileEx")
	reviewUnlockFileEx = reviewKernel32.NewProc("UnlockFileEx")
)

func lockReviewFile(file *os.File) error {
	overlapped := new(syscall.Overlapped)
	result, _, callErr := reviewLockFileEx.Call(file.Fd(), reviewLockExclusive|reviewLockFailImmediately, 0, 1, 0, uintptr(unsafe.Pointer(overlapped)))
	if result != 0 {
		return nil
	}
	if callErr != syscall.Errno(0) {
		return callErr
	}
	return syscall.EINVAL
}

func unlockReviewFile(file *os.File) error {
	overlapped := new(syscall.Overlapped)
	result, _, callErr := reviewUnlockFileEx.Call(file.Fd(), 0, 1, 0, uintptr(unsafe.Pointer(overlapped)))
	if result != 0 {
		return nil
	}
	if callErr != syscall.Errno(0) {
		return callErr
	}
	return syscall.EINVAL
}

func reviewLockBusy(err error) bool {
	return errors.Is(err, reviewErrorLockViolation) || errors.Is(err, reviewErrorSharing)
}
