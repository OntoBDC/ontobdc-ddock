from django.contrib import admin
from unfold.admin import ModelAdmin
from .models import Container

@admin.register(Container)
class ContainerAdmin(ModelAdmin):
    list_display = ['name', 'url', 'created_at']
    readonly_fields = ('id', 'uri', 'url', 'created_at', 'last_event_hash')
    search_fields = ['name', 'uri', 'url']
    list_filter = ['created_at']
    fields = ('name', 'description')