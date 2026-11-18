from contextlib import contextmanager
from threading import Lock
from weakref import WeakValueDictionary
from app.services.topology import ConfigurationConflictError

_registry_lock = Lock()
_devices = WeakValueDictionary()


@contextmanager
def exclusive_operation(connection):
    """Serialize writes/scans per address, including API and API-SSL sessions."""
    with _registry_lock:
        key = str(connection.host)
        lock = _devices.setdefault(key, Lock())
    if not lock.acquire(blocking=False):
        raise ConfigurationConflictError("Já há uma operação em andamento neste MikroTik. Aguarde a conclusão antes de tentar novamente.")
    try:
        yield
    finally:
        lock.release()
