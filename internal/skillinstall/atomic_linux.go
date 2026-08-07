//go:build linux

package skillinstall

import (
	"fmt"
	"os"
	"runtime"
	"syscall"
	"unsafe"
)

func atomicPublish(stage, target string) error {
	number := renameat2Number(runtime.GOARCH)
	if number == 0 {
		return checkedRename(stage, target)
	}
	oldPath, err := syscall.BytePtrFromString(stage)
	if err != nil {
		return err
	}
	newPath, err := syscall.BytePtrFromString(target)
	if err != nil {
		return err
	}
	atFDCWD := ^uintptr(99) // -100
	_, _, errno := syscall.Syscall6(number, atFDCWD, uintptr(unsafe.Pointer(oldPath)), atFDCWD, uintptr(unsafe.Pointer(newPath)), 1, 0)
	if errno != 0 {
		return errno
	}
	return nil
}

func renameat2Number(architecture string) uintptr {
	switch architecture {
	case "amd64":
		return 316
	case "386":
		return 353
	case "arm":
		return 382
	case "arm64", "riscv64":
		return 276
	case "ppc64", "ppc64le":
		return 357
	case "s390x":
		return 347
	default:
		return 0
	}
}

func checkedRename(stage, target string) error {
	if _, err := os.Lstat(target); err == nil {
		return fmt.Errorf("target already exists")
	} else if !os.IsNotExist(err) {
		return err
	}
	return os.Rename(stage, target)
}
