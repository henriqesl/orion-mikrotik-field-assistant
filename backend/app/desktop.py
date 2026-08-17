import argparse
import logging
import multiprocessing
import os
from collections.abc import Sequence
from pathlib import Path

DEFAULT_DESKTOP_PORT = 8765


def _port(value: str) -> int:
    port = int(value)
    if not 1024 <= port <= 65535:
        raise argparse.ArgumentTypeError("a porta deve estar entre 1024 e 65535")
    return port


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Backend local do ORION Field")
    parser.add_argument("--port", type=_port, default=DEFAULT_DESKTOP_PORT)
    parser.add_argument(
        "--log-level",
        choices=("critical", "error", "warning", "info"),
        default="warning",
    )
    return parser


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
