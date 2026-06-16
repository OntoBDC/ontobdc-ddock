
import uuid
from django.db import models
from .services import ContainerFileService


class Container(models.Model):
    """
    Represents an OntoBDC logical container.
    """
    # UUID as internal PK
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # URI as the OntoBDC logical identifier
    uri = models.CharField(max_length=512, unique=True)
    
    # Physical or remote URL where the container is stored
    url = models.URLField(max_length=1024, blank=True)
    
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    # Last event hash for traceability/integrity
    last_event_hash = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    @property
    def file(self):
        return ContainerFileService(self)
