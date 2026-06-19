
import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser, Permission
from django.utils.translation import gettext_lazy as _
from .services import ContainerFileService


class Group(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(_("name"), max_length=150, unique=True)
    permissions = models.ManyToManyField(
        Permission,
        verbose_name=_("permissions"),
        blank=True,
        related_name="custom_group_set",
        related_query_name="custom_group",
    )

    class Meta:
        verbose_name = _("group")
        verbose_name_plural = _("groups")

    def __str__(self):
        return self.name

    def natural_key(self):
        return (self.name,)


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    groups = models.ManyToManyField(
        Group,
        verbose_name=_("groups"),
        blank=True,
        help_text=_(
            "The groups this user belongs to. A user will get all permissions "
            "granted to each of their groups."
        ),
        related_name="user_set",
        related_query_name="user",
    )


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


class ContainerLog(models.Model):
    """
    Stores logs for a Container.
    """
    LEVEL_DEBUG = 'DEBUG'
    LEVEL_INFO = 'INFO'
    LEVEL_WARNING = 'WARNING'
    LEVEL_ERROR = 'ERROR'
    LEVEL_READY = 'READY'
    LEVEL_FAIL = 'FAIL'
    LEVEL_CHOICES = [
        (LEVEL_DEBUG, 'Debug'),
        (LEVEL_INFO, 'Info'),
        (LEVEL_WARNING, 'Warning'),
        (LEVEL_ERROR, 'Error'),
        (LEVEL_READY, 'Connected'),
        (LEVEL_FAIL, 'Fail'),
    ]

    id = models.BigAutoField(primary_key=True)
    container = models.ForeignKey(Container, on_delete=models.CASCADE, related_name='logs')
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, default=LEVEL_INFO)
    message = models.TextField()
    dispatched_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['dispatched_at']
        indexes = [
            models.Index(fields=['container', 'dispatched_at']),
            models.Index(fields=['container', 'level']),
        ]

    def __str__(self):
        return f"{self.dispatched_at} [{self.level}] {self.container.name}: {self.message[:50]}"
