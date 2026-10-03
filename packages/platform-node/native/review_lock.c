#define _GNU_SOURCE

#include <node_api.h>

#include <errno.h>
#include <fcntl.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <io.h>
#include <windows.h>
#include <sys/stat.h>
#include <fcntl.h>
#else
#include <sys/file.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <unistd.h>
#if defined(__linux__)
#include <sys/syscall.h>
#ifndef RENAME_NOREPLACE
#define RENAME_NOREPLACE (1 << 0)
#endif
#endif
#if defined(__APPLE__)
#include <sys/param.h>
#include <sys/rename.h>
#endif
#endif

typedef struct {
#ifdef _WIN32
  int fd;
  HANDLE handle;
#else
  int fd;
#endif
  int active;
} lock_handle;

static const napi_type_tag lock_handle_tag = {
    0x8ea034f5f4804b23ULL,
    0x9ca529127d69df38ULL,
};

static void throw_status(napi_env env, napi_status status, const char *message) {
  if (status != napi_ok) {
    napi_throw_error(env, "ERR_NATIVE_HELPER", message);
  }
}

static char *read_string(napi_env env, napi_value value) {
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, NULL, 0, &length) != napi_ok) {
    napi_throw_type_error(env, "ERR_INVALID_ARG_TYPE", "native helper paths must be strings");
    return NULL;
  }
  char *result = (char *)malloc(length + 1);
  if (result == NULL) {
    napi_throw_error(env, "ERR_NATIVE_HELPER", "could not allocate a native helper path");
    return NULL;
  }
  if (napi_get_value_string_utf8(env, value, result, length + 1, &length) != napi_ok) {
    free(result);
    napi_throw_error(env, "ERR_NATIVE_HELPER", "could not read a native helper path");
    return NULL;
  }
  if (strlen(result) != length) {
    free(result);
    napi_throw_type_error(env, "ERR_INVALID_ARG_VALUE", "native helper paths must not contain NUL");
    return NULL;
  }
  return result;
}

#ifdef _WIN32
static wchar_t *utf8_to_wide(napi_env env, const char *value) {
  int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value, -1, NULL, 0);
  if (length <= 0) {
    napi_throw_type_error(env, "ERR_INVALID_ARG_VALUE", "native helper path is not valid UTF-8");
    return NULL;
  }
  wchar_t *result = (wchar_t *)malloc((size_t)length * sizeof(wchar_t));
  if (result == NULL) {
    napi_throw_error(env, "ERR_NATIVE_HELPER", "could not allocate a native helper path");
    return NULL;
  }
  if (MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value, -1, result, length) <= 0) {
    free(result);
    napi_throw_type_error(env, "ERR_INVALID_ARG_VALUE", "native helper path is not valid UTF-8");
    return NULL;
  }
  return result;
}
#endif

static void release_lock(lock_handle *lock) {
  if (lock == NULL || !lock->active) {
    return;
  }
#ifdef _WIN32
  OVERLAPPED overlapped;
  memset(&overlapped, 0, sizeof(overlapped));
  UnlockFileEx(lock->handle, 0, 1, 0, &overlapped);
  _close(lock->fd);
#else
  flock(lock->fd, LOCK_UN);
  close(lock->fd);
#endif
  lock->active = 0;
}

static void lock_finalizer(napi_env env, void *data, void *hint) {
  (void)env;
  (void)hint;
  release_lock((lock_handle *)data);
  free(data);
}

static napi_value try_lock(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_value result;
  napi_status status = napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (status != napi_ok || argc != 1) {
    napi_throw_type_error(env, "ERR_INVALID_ARG_COUNT", "tryLock requires one path");
    return NULL;
  }
  char *path = read_string(env, argv[0]);
  if (path == NULL) {
    return NULL;
  }

  lock_handle *lock = (lock_handle *)calloc(1, sizeof(lock_handle));
  if (lock == NULL) {
    free(path);
    napi_throw_error(env, "ERR_NATIVE_HELPER", "could not allocate a lock handle");
    return NULL;
  }
#ifdef _WIN32
  wchar_t *wide_path = utf8_to_wide(env, path);
  if (wide_path == NULL) {
    free(lock);
    free(path);
    return NULL;
  }
  lock->fd = _wopen(
      wide_path,
      _O_RDWR | _O_CREAT | _O_BINARY | _O_NOINHERIT,
      _S_IREAD | _S_IWRITE);
  free(wide_path);
  if (lock->fd < 0) {
    free(lock);
    free(path);
    napi_throw_error(env, "ERR_NATIVE_HELPER", "could not open the lock file");
    return NULL;
  }
  lock->handle = (HANDLE)_get_osfhandle(lock->fd);
  OVERLAPPED overlapped;
  memset(&overlapped, 0, sizeof(overlapped));
  if (!LockFileEx(lock->handle, LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &overlapped)) {
    DWORD error = GetLastError();
    _close(lock->fd);
    free(lock);
    free(path);
    if (error == ERROR_LOCK_VIOLATION || error == ERROR_SHARING_VIOLATION) {
      napi_get_null(env, &result);
      return result;
    }
    napi_throw_error(env, "ERR_NATIVE_HELPER", "could not lock the state file");
    return NULL;
  }
#else
  int flags = O_RDWR | O_CREAT;
#ifdef O_NOFOLLOW
  flags |= O_NOFOLLOW;
#endif
#ifdef O_CLOEXEC
  flags |= O_CLOEXEC;
#endif
  lock->fd = open(path, flags, 0600);
  if (lock->fd < 0) {
    free(lock);
    free(path);
    napi_throw_error(env, "ERR_NATIVE_HELPER", "could not open the lock file");
    return NULL;
  }
#ifndef O_CLOEXEC
  if (fcntl(lock->fd, F_SETFD, FD_CLOEXEC) != 0) {
    close(lock->fd);
    free(lock);
    free(path);
    napi_throw_error(env, "ERR_NATIVE_HELPER", "could not protect the lock descriptor");
    return NULL;
  }
#endif
  if (flock(lock->fd, LOCK_EX | LOCK_NB) != 0) {
    int error = errno;
    close(lock->fd);
    free(lock);
    free(path);
    if (error == EWOULDBLOCK || error == EAGAIN) {
      napi_get_null(env, &result);
      return result;
    }
    napi_throw_error(env, "ERR_NATIVE_HELPER", "could not lock the state file");
    return NULL;
  }
#endif
  free(path);
  lock->active = 1;
  status = napi_create_object(env, &result);
  if (status == napi_ok) {
    status = napi_type_tag_object(env, result, &lock_handle_tag);
  }
  if (status == napi_ok) {
    status = napi_wrap(env, result, lock, lock_finalizer, NULL, NULL);
  }
  if (status != napi_ok) {
    release_lock(lock);
    free(lock);
    throw_status(env, status, "could not create a native lock handle");
    return NULL;
  }
  return result;
}

static napi_value unlock(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_status status = napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (status != napi_ok || argc != 1) {
    napi_throw_type_error(env, "ERR_INVALID_ARG_COUNT", "unlock requires one handle");
    return NULL;
  }
  bool tagged = false;
  status = napi_check_object_type_tag(env, argv[0], &lock_handle_tag, &tagged);
  lock_handle *lock = NULL;
  if (status == napi_ok && tagged) {
    status = napi_unwrap(env, argv[0], (void **)&lock);
  }
  if (status != napi_ok || !tagged || lock == NULL) {
    napi_throw_type_error(env, "ERR_INVALID_ARG_TYPE", "unlock requires a native lock handle");
    return NULL;
  }
  release_lock(lock);
  napi_value result;
  if (napi_get_undefined(env, &result) != napi_ok) {
    return NULL;
  }
  return result;
}

static int publish_no_replace(const char *source, const char *destination) {
#if defined(__linux__)
#ifdef SYS_renameat2
  return (int)syscall(SYS_renameat2, AT_FDCWD, source, AT_FDCWD, destination, RENAME_NOREPLACE);
#else
  (void)source;
  (void)destination;
  errno = ENOTSUP;
  return -1;
#endif
#elif defined(__APPLE__)
  return renameatx_np(AT_FDCWD, source, AT_FDCWD, destination, RENAME_EXCL);
#elif defined(_WIN32)
  int sourceLength = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, source, -1, NULL, 0);
  int destinationLength = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, destination, -1, NULL, 0);
  if (sourceLength <= 0 || destinationLength <= 0) {
    SetLastError(ERROR_NO_UNICODE_TRANSLATION);
    return -1;
  }
  wchar_t *wideSource = (wchar_t *)malloc((size_t)sourceLength * sizeof(wchar_t));
  wchar_t *wideDestination = (wchar_t *)malloc((size_t)destinationLength * sizeof(wchar_t));
  if (wideSource == NULL || wideDestination == NULL) {
    free(wideSource);
    free(wideDestination);
    SetLastError(ERROR_NOT_ENOUGH_MEMORY);
    return -1;
  }
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, source, -1, wideSource, sourceLength);
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, destination, -1, wideDestination, destinationLength);
  BOOL result = MoveFileExW(wideSource, wideDestination, 0);
  free(wideSource);
  free(wideDestination);
  return result ? 0 : -1;
#else
  (void)source;
  (void)destination;
  errno = ENOTSUP;
  return -1;
#endif
}

static napi_value publish(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_status status = napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (status != napi_ok || argc != 2) {
    napi_throw_type_error(env, "ERR_INVALID_ARG_COUNT", "publishNoReplace requires source and destination");
    return NULL;
  }
  char *source = read_string(env, argv[0]);
  char *destination = read_string(env, argv[1]);
  if (source == NULL || destination == NULL) {
    free(source);
    free(destination);
    return NULL;
  }
  int result = publish_no_replace(source, destination);
  int error = errno;
#ifdef _WIN32
  DWORD windowsError = GetLastError();
  if (windowsError == ERROR_FILE_EXISTS || windowsError == ERROR_ALREADY_EXISTS) {
    error = EEXIST;
  } else if (windowsError == ERROR_NOT_SUPPORTED) {
    error = ENOTSUP;
  }
#endif
  free(source);
  free(destination);
  if (result != 0) {
    if (error == EEXIST) {
      napi_throw_error(env, "EEXIST", "destination already exists");
    } else if (error == ENOTSUP) {
      napi_throw_error(env, "ERR_NATIVE_UNAVAILABLE", "no-replace publish is unavailable on this platform");
    } else {
      napi_throw_error(env, "ERR_NATIVE_PUBLISH", "no-replace publish failed");
    }
    return NULL;
  }
  napi_value output;
  if (napi_get_undefined(env, &output) != napi_ok) {
    return NULL;
  }
  return output;
}

NAPI_MODULE_INIT() {
  napi_property_descriptor properties[] = {
      {"tryLock", NULL, try_lock, NULL, NULL, NULL, napi_default, NULL},
      {"unlock", NULL, unlock, NULL, NULL, NULL, napi_default, NULL},
      {"publishNoReplace", NULL, publish, NULL, NULL, NULL, napi_default, NULL},
  };
  napi_status status = napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  if (status != napi_ok) {
    napi_throw_error(env, "ERR_NATIVE_HELPER", "could not initialize the native helper");
  }
  return exports;
}
