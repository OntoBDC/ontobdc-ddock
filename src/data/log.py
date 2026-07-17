
from datetime import datetime
from django.utils import timezone
from data.models import Container, ContainerLog
from ontobdc.shared.domain.port.logger import LogLevelPort
from ontobdc.shared.domain.resource.logger import LogStrategyResource


class GatewayContainerLogRepository:
    def add_log(self, container_id: str, level: str, message: str, dispatched_at: datetime = None) -> ContainerLog:
        """
        Add a log entry to the database.
        """
        if dispatched_at is None:
            dispatched_at = timezone.now()

        container = Container.objects.get(id=container_id)
        
        log = ContainerLog.objects.create(
            container=container,
            level=level,
            message=message,
            dispatched_at=dispatched_at
        )

        return log
        
    def get_log_after(self, container_id: str, log_id: int):
        """
        Get all log entries for a container after a given log ID.
        """
        container = Container.objects.get(id=container_id)
        return container.logs.filter(id__gt=log_id).order_by('id')



class GatewayLogStrategy(LogStrategyResource):
    """
    LogStrategyResource that stores logs and broadcasts them to WebSocket subscribers.
    """
    def __init__(self, container_id: str, log_level: LogLevelPort):
        self._container_id: str = container_id
        self._log_repository: GatewayContainerLogRepository = GatewayContainerLogRepository()
        
        super().__init__(
            print_log=self.save_log,
            log_level=log_level,
            log_repository=self._log_repository
        )
        
    def save_log(self, level: str, message: str):
        """
        Save a log entry to the database.
        """
        self._log_repository.add_log(
            container_id=self._container_id,
            level=level,
            message=message
        )

    def set_as_ready(self):
        """
        Set the container as ready.
        """
        self.save_log(ContainerLog.LEVEL_READY, '')

    def set_as_fail(self, message: str):
        """
        Set the container as fail.
        """
        self.save_log(ContainerLog.LEVEL_FAIL, message)
