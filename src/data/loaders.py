
import os
from pathlib import Path
from typing import List, Tuple
from django.conf import settings
from data.models import Container, User
from data.log import GatewayLogStrategy
from ontobdc.shared.domain.resource.logger import LogLevel
from ontobdc.shared.domain.port.logger import LogLevelPort
from ontobdc.cli.domain.port.command import CliCommandPort
from ontobdc.cli.adapter.command import CliCommandRunAdapter
from ontobdc.shared.domain.port.logger import LoggerAwarePort
from ontobdc.cli.domain.response.command import CommandResponse, ExceptionCommandResponse


class GatewayContainerLoader:
    """
    Builder class to construct and dispatch OntoBDC commands.
    """
    @staticmethod
    def check_command(cli_command_run: CliCommandPort, args: List[str]) -> bool:
        return cli_command_run.check()

    @staticmethod
    def set_container_storage_root(user: User, container: Container) -> None:
        """
        Set the ONTOBDC_PROJECT_ROOT environment variable to the container's storage root.
        """
        root_dir: Path = Path(settings.USER_STORAGE_ROOT / str(user.id) / settings.CONTAINER_STORAGE_ROOT / str(container.id))
        root_dir.mkdir(parents=True, exist_ok=True)
        if not root_dir.exists():
            raise FileNotFoundError(f"Failed to create container storage root: {root_dir}")

        config_file: Path = root_dir / ".__ontobdc__" / "config.yaml"
        config_file.parent.mkdir(parents=True, exist_ok=True)
        config_file.touch()
        if not config_file.exists():
            raise FileNotFoundError(f"Failed to create config file: {config_file}")

        os.environ["ONTOBDC_PROJECT_ROOT"] = str(root_dir)

    @classmethod
    def dispatch(cls, user: User, container: Container, incoming_args: List[str], log_level: LogLevelPort = LogLevel.INFORMATIONAL) -> Tuple[CommandResponse, GatewayLogStrategy]:
        """
        Dispatch the OntoBDC command with the given container and log level.
        """
        try:
            cls.set_container_storage_root(user, container)
            cli_command_run: CliCommandPort = CliCommandRunAdapter.make(incoming_args)

            if cls.check_command(cli_command_run, incoming_args):
                log_strategy = GatewayLogStrategy(
                    container_id=container.id,
                    log_level=log_level,
                )

                if isinstance(cli_command_run, LoggerAwarePort):
                    cli_command_run.set_log_strategy(log_strategy)

                response: CommandResponse = cli_command_run.run()
                return (cls.render(cls, response, log_strategy), log_strategy)

        except Exception as e:
            from data.error import log_and_raise_error
            log_and_raise_error(e)

    @staticmethod
    def render_exception(response: CommandResponse, log_strategy: GatewayLogStrategy) -> CommandResponse:
        """
        Render the command exception response and save it to the log strategy.
        """
        log_strategy.save_log(LogLevel.ERROR.name, response.description)

        return response

    @staticmethod
    def render(cls, response: CommandResponse, log_strategy: GatewayLogStrategy) -> CommandResponse:
        """
        Render the command response and save it to the log strategy.
        """
        if isinstance(response, ExceptionCommandResponse):
            return cls.render_exception(response, log_strategy)

        return response


