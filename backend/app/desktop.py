import argparse
import ctypes
import logging
import multiprocessing
import os
import threading
import time
from collections.abc import Sequence
from ctypes import wintypes
from pathlib import Path

DEFAULT_DESKTOP_PORT = 8765


def _port(value: str) -> int:
    port = int(value)
    if not 1024 <= port <= 65535:
        raise argparse.ArgumentTypeError("a porta deve estar entre 1024 e 65535")
    return port


def _positive_pid(value: str) -> int:
    process_id = int(value)
    if process_id <= 0:
        raise argparse.ArgumentTypeError("o PID deve ser positivo")
    return process_id


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Backend local do ORION Field")
    parser.add_argument("--port", type=_port, default=DEFAULT_DESKTOP_PORT)
    parser.add_argument("--parent-pid", type=_positive_pid)
    parser.add_argument(
        "--log-level",
        choices=("critical", "error", "warning", "info"),
        default="warning",
    )
    return parser


def _is_process_running(process_id: int) -> bool:
    process_query_limited_information = 0x1000
    still_active = 259
    kernel32 = ctypes.windll.kernel32
    open_process = kernel32.OpenProcess
    open_process.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
    open_process.restype = wintypes.HANDLE
    get_exit_code = kernel32.GetExitCodeProcess
    get_exit_code.argtypes = (wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD))
    get_exit_code.restype = wintypes.BOOL
    close_handle = kernel32.CloseHandle
    close_handle.argtypes = (wintypes.HANDLE,)
    close_handle.restype = wintypes.BOOL

    handle = open_process(
        process_query_limited_information,
        False,
        process_id,
    )
    if not handle:
        return False

    try:
        exit_code = wintypes.DWORD()
        if not get_exit_code(handle, ctypes.byref(exit_code)):
            return False
        return exit_code.value == still_active
    finally:
        close_handle(handle)


def _watch_parent_process(process_id: int, interval_seconds: float = 0.5) -> None:
    while True:
        time.sleep(interval_seconds)
        if not _is_process_running(process_id):
            os._exit(0)


def _start_parent_watchdog(process_id: int | None) -> None:
    if process_id is None:
        return
    threading.Thread(
        target=_watch_parent_process,
        args=(process_id,),
        name="orion-parent-watchdog",
        daemon=True,
    ).start()


def _configure_file_logging(level: str) -> Path:
    local_data = Path(os.environ.get("LOCALAPPDATA", Path.home()))
    log_directory = local_data / "BIONIC" / "ORION Field" / "logs"
    log_directory.mkdir(parents=True, exist_ok=True)
    log_file = log_directory / "backend.log"
    logging.basicConfig(
        filename=log_file,
        level=getattr(logging, level.upper()),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        encoding="utf-8",
        force=True,
    )
    return log_file


def main(arguments: Sequence[str] | None = None) -> None:
    multiprocessing.freeze_support()
    options = create_parser().parse_args(arguments)
    _configure_file_logging(options.log_level)
    _start_parent_watchdog(options.parent_pid)
    logger = logging.getLogger("orion.desktop")

    try:
        import uvicorn

        from app.main import app

        logger.info("Iniciando backend desktop na porta %s.", options.port)
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=options.port,
            log_config=None,
            access_log=False,
        )
    except Exception:
        logger.exception("O backend desktop não conseguiu iniciar.")
        raise


if __name__ == "__main__":
    main()
