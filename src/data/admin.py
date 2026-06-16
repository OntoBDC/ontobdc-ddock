from django.contrib import admin
from django.urls import path
from django.http import HttpResponseRedirect
from django.shortcuts import render
from django.contrib import messages
from unfold.admin import ModelAdmin
from .models import Container

@admin.register(Container)
class ContainerAdmin(ModelAdmin):
    list_display = ['name', 'url', 'created_at']
    readonly_fields = ('id', 'uri', 'url', 'created_at', 'last_event_hash')
    search_fields = ['name', 'uri', 'url']
    list_filter = ['created_at']
    fields = ('name', 'description')

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('import/', self.admin_site.admin_view(self.import_view), name='data_container_import'),
        ]
        return custom_urls + urls

    def add_view(self, request, form_url='', extra_context=None):
        # Intercept the "+" Add button
        action_type = request.GET.get('action_type')
        
        if action_type == 'manual':
            # Proceed to standard django admin add form
            return super().add_view(request, form_url, extra_context)
        elif action_type == 'import':
            # Redirect to our custom import view
            return HttpResponseRedirect('../import/')
            
        # If no choice is made, render the selection screen
        context = {
            **self.admin_site.each_context(request),
            'title': 'Escolha a forma de inclusão',
            'opts': self.model._meta,
        }
        return render(request, 'admin/data/container/choose_add_action.html', context)

    def import_view(self, request):
        context = {
            **self.admin_site.each_context(request),
            'title': 'Importar Container',
            'opts': self.model._meta,
        }
        return render(request, 'admin/data/container/import.html', context)