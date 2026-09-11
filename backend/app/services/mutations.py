"""Safe, deliberately non-transactional RouterOS writes with useful failure context."""

from typing import Any

from routeros.errors import RouterOSError

from app.services.routeros import MikroTikError


class ConfigurationApplyError(MikroTikError):
    """A write failed or could not be confirmed; never implies automatic rollback."""


class ConfigurationWriter:
    def __init__(self, client: Any, backup: str):
        self.client = client
        self.backup = backup
        self.backup_created = False

    def run(self, stage: str, *words: str):
        try:
            return self.client.run(*words)
        except (RouterOSError, OSError) as error:
            self.fail(stage, error)

    def fail(self, stage: str, cause: Exception | None = None):
        recovery = (
            f"Pode haver alterações parciais. Backup no MikroTik: {self.backup}.backup. "
            "Reconecte e confira a configuração antes de tentar novamente."
            if self.backup_created else
            "Nenhuma configuração foi alterada pelo ORION. Confira as permissões do usuário e o espaço livre."
        )
        # RouterOS errors may contain complete commands, including credentials.
        raise ConfigurationApplyError(f"Não foi possível confirmar {stage}. {recovery}") from cause

    def create_backup(self):
        self.run("a criação do backup", "/system/backup/save", f"=name={self.backup}")
        self.backup_created = True

    def tracked_client(self, stage: str):
        writer = self
        class TrackedClient:
            def run(self, *words):
                return writer.run(stage, *words)
        return TrackedClient()
