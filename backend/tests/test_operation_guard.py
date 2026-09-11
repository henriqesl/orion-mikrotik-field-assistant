import pytest
from app.models.mikrotik import MikroTikConnection
from app.services.configuration import ConfigurationConflictError
from app.services.operation_guard import exclusive_operation


def test_same_device_cannot_scan_and_apply_concurrently_even_on_different_api_ports():
    plain = MikroTikConnection(host="192.0.2.1", username="test", password="test")
    secure = plain.model_copy(update={"port": 8729, "use_tls": True})
    with exclusive_operation(plain):
        with pytest.raises(ConfigurationConflictError, match="operação em andamento"):
            with exclusive_operation(secure):
                pytest.fail("Concurrent operation was admitted")
    with exclusive_operation(secure):
        pass


def test_failure_releases_device_and_other_devices_remain_independent():
    first = MikroTikConnection(host="192.0.2.1", username="test", password="test")
    second = first.model_copy(update={"host": "192.0.2.2"})
    with pytest.raises(RuntimeError):
        with exclusive_operation(first), exclusive_operation(second):
            raise RuntimeError("Simulated failure")
    with exclusive_operation(first):
        pass
