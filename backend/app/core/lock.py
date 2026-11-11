import logging
import os
import sys

logger = logging.getLogger("pos.lock")

_lock_file_handle = None


def acquire_server_lock(lock_path: str = "data/server.lock") -> bool:
    """
    Acquires an exclusive OS-level lock on lock_path to ensure only one
    POS server instance runs at a time.
    The OS-level lock (msvcrt on Windows, fcntl.flock on POSIX) is the source of truth.
    The PID inside the lock file is purely informational.
    If the lock can be acquired and the file had content, it is stale: overwrites and logs a WARNING.
    If another live process holds it, refuses to start and returns False.
    """
    global _lock_file_handle
    try:
        os.makedirs(os.path.dirname(os.path.abspath(lock_path)), exist_ok=True)

        # Read old PID if present before acquiring
        old_pid = None
        if os.path.exists(lock_path) and os.path.getsize(lock_path) > 0:
            try:
                with open(lock_path, "r", encoding="utf-8") as rf:
                    old_pid = rf.read().strip()
            except Exception:
                old_pid = None

        # Note: on Windows a+ mode needs at least 1 byte to lock
        f = open(lock_path, "a+", encoding="utf-8")
        if os.path.getsize(lock_path) == 0:
            f.write("0\n")
            f.flush()

        if sys.platform == "win32":
            import msvcrt
            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

        # OS lock acquired successfully
        if old_pid and old_pid != "0" and old_pid != str(os.getpid()):
            logger.warning("Overwriting stale server lock file at %s (previous PID was %s)", lock_path, old_pid)

        f.seek(0)
        f.truncate()
        f.write(f"{os.getpid()}\n")
        f.flush()
        _lock_file_handle = f
        return True
    except (IOError, OSError) as e:
        logger.debug("Failed to acquire server lock %s: %s", lock_path, e)
        return False


def release_server_lock():
    """Releases the exclusive OS-level lock and closes the lock file handle."""
    global _lock_file_handle
    if _lock_file_handle is not None:
        try:
            if sys.platform == "win32":
                import msvcrt
                _lock_file_handle.seek(0)
                msvcrt.locking(_lock_file_handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(_lock_file_handle.fileno(), fcntl.LOCK_UN)
            _lock_file_handle.close()
        except Exception as e:
            logger.debug("Error releasing server lock: %s", e)
        finally:
            _lock_file_handle = None


def is_server_running(lock_path: str = "data/server.lock") -> bool:
    """Checks whether the server lock is currently held by an active process."""
    if not os.path.exists(lock_path):
        return False
    try:
        f = open(lock_path, "a+", encoding="utf-8")
        if os.path.getsize(lock_path) == 0:
            f.write("0\n")
            f.flush()

        try:
            if sys.platform == "win32":
                import msvcrt
                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
                msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            f.close()
            return False  # Able to lock -> no other server process is running
        except (IOError, OSError):
            f.close()
            return True   # Unable to lock -> server is currently running
    except Exception:
        return False

