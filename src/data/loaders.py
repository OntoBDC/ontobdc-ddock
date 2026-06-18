
from typing import List
from data.models import Container
from data.log import GatewayLogStrategy
from ontobdc.shared.domain.resource.logger import LogLevel
from ontobdc.shared.domain.port.logger import LogLevelPort
from ontobdc.cli.domain.port.command import CliCommandPort
from ontobdc.cli.adapter.command import CliCommandRunAdapter
from ontobdc.shared.domain.port.logger import LoggerAwarePort
from ontobdc.cli.domain.resource.command import CommandResponse


class GatewayContainerLoader:
    """
    Builder class to construct and dispatch OntoBDC commands.
    """
    def check_command(cls, cli_command_run: CliCommandPort, args: List[str]) -> bool:
        return cli_command_run.check_command(args)

    @classmethod
    def dispatch(cls, container: Container, log_level: LogLevelPort = LogLevel.INFORMATIONAL):
        """
        Dispatch the OntoBDC command with the given container and log level.
        """
        incoming_args: List[str] = ['check','--all']
        print(cls.__name__, incoming_args)
        try:
            cli_command_run: CliCommandPort = CliCommandRunAdapter.make(incoming_args)
            print(cls.__name__, cli_command_run)

            if cls.check_command(cli_command_run, incoming_args):
                if isinstance(cli_command_run, LoggerAwarePort):
                    log_strategy = GatewayLogStrategy(
                        container=container,
                        log_level=log_level,
                    )
                    cli_command_run.set_log_strategy(log_strategy)

                response: CommandResponse = cli_command_run.run()
                print(cls.__name__, f"Error: {response} {type(response)}")
        except Exception as e:
            from data.error import log_and_raise_error
            log_and_raise_error(e)




