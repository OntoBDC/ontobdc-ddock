from django.contrib import admin
from unfold.admin import ModelAdmin
from django.urls import path, reverse
from django.utils.html import format_html
from .models import Container, ContainerLog
from django.http import HttpResponseRedirect
from .log import GatewayContainerLogRepository
from concurrent.futures import ThreadPoolExecutor
from .loaders import GatewayContainerLoader
from django.shortcuts import render, get_object_or_404

@admin.register(Container)
class ContainerAdmin(ModelAdmin):
    list_display = ['name', 'url', 'created_at', 'edit_link']
    list_display_links = ['name']  # Clica no nome para visualizar
    readonly_fields = ('id', 'uri', 'url', 'created_at', 'last_event_hash')
    search_fields = ['name', 'uri', 'url']
    list_filter = ['created_at']
    fields = ('name', 'description')

    def edit_link(self, obj):
        url = reverse('admin:data_container_change', args=[obj.pk])
        url += '?from_edit=1'  # Flag to bypass the redirect
        return format_html('''
            <a href="{}" style="color: var(--unfold-primary-color)">
                <span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">edit</span>
            </a>
        ''', url)
    edit_link.short_description = ''

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('import/', self.admin_site.admin_view(self.import_view), name='data_container_import'),
            path('<uuid:pk>/view/', self.admin_site.admin_view(self.view_container), name='data_container_view'),
            path('<uuid:pk>/log/', self.admin_site.admin_view(self.container_log_view), name='data_container_log'),
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

    def changeform_view(self, request, object_id=None, form_url='', extra_context=None):
        # When clicking on the name (change link), redirect to custom view
        # Only if it's not the edit link itself
        if object_id and not ('_save' in request.POST or '_addanother' in request.POST or '_continue' in request.POST):
            # Only redirect for GET requests, not when submitting the form
            if request.method == 'GET':
                # Check if we're coming from the edit link
                if 'from_edit' not in request.GET:
                    return HttpResponseRedirect(reverse('admin:data_container_view', args=[object_id]))
        return super().changeform_view(request, object_id, form_url, extra_context)

    def view_container(self, request, pk):
        container = get_object_or_404(Container, pk=pk)
        
        context = {
            **self.admin_site.each_context(request),
            'title': f'Container: {container.name}',
            'opts': self.model._meta,
            'container': container,
        }

        # Function to run in a separate thread
        def run_dispatch():
            GatewayContainerLoader.dispatch(container)

        # Run the dispatch in a future thread
        executor = ThreadPoolExecutor(max_workers=1)
        executor.submit(run_dispatch)
        executor.shutdown(wait=False)

        return render(request, 'admin/data/container/view.html', context)
        
    def container_log_view(self, request, pk):
        container: Container = get_object_or_404(Container, pk=pk)
        after_id: int = request.GET.get('after', 0)
        log_repository: GatewayContainerLogRepository = GatewayContainerLogRepository()
        
        # Get logs after the given ID to avoid repetition
        logs = log_repository.get_log_after(container_id=str(pk), log_id=after_id)
        
        # Format the log lines
        lines = []
        last_id = after_id
        for log in logs:
            timestamp = log.dispatched_at.strftime('%H:%M:%S')
            lines.append((timestamp, log.level, log.message))
            last_id = log.id
        
        # Create the response
        finished = not logs.exists() or False  # For future use
        
        return render(request, 'admin/data/container/log_partial.html', {
            'container': container,
            'lines': lines,
            'last_line': last_id,
            'finished': finished,
        })

@admin.register(ContainerLog)
class ContainerLogAdmin(ModelAdmin):
    list_display = ['container', 'level', 'message', 'dispatched_at']
    list_filter = ['container', 'level', 'dispatched_at']
    search_fields = ['message']
    readonly_fields = ['container', 'level', 'message', 'dispatched_at']
    date_hierarchy = 'dispatched_at'