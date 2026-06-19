from ontobdc.cli.domain.resource.command import CheckFailCommandResponse, ExceptionCommandResponse

from django.contrib import admin
from django.contrib.auth.models import Group as DefaultGroup
from data.error import log_and_raise_error
from unfold.admin import ModelAdmin
from unfold.forms import AdminPasswordChangeForm, UserChangeForm, UserCreationForm
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.admin import GroupAdmin as BaseGroupAdmin
from django.urls import path, reverse
from django.utils.html import format_html
from .models import Container, ContainerLog, User, Group
from django.http import HttpResponseRedirect
from .log import GatewayContainerLogRepository
from concurrent.futures import ThreadPoolExecutor
from .loaders import GatewayContainerLoader
from django.shortcuts import render, get_object_or_404

admin.site.unregister(DefaultGroup)

@admin.register(User)
class UserAdmin(BaseUserAdmin, ModelAdmin):
    form = UserChangeForm
    add_form = UserCreationForm
    change_password_form = AdminPasswordChangeForm

@admin.register(Group)
class GroupAdmin(BaseGroupAdmin, ModelAdmin):
    pass

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
        
        # Add initial "Processing" log
        log_repo = GatewayContainerLogRepository()
        log_repo.add_log(
            container_id=str(container.id),
            level=ContainerLog.LEVEL_INFO,
            message="Processing..."
        )
        
        # Get the last log to initialize the poller correctly
        last_log = container.logs.order_by('-id').first()
        last_line = last_log.id if last_log else 0
        last_level = last_log.level if last_log else None
        
        context = {
            **self.admin_site.each_context(request),
            'title': f'Container: {container.name}',
            'opts': self.model._meta,
            'container': container,
            'last_line': last_line,
            'last_level': last_level,
        }

        # Function to run in a separate thread
        def run_dispatch():
            response, log_strategy = GatewayContainerLoader.dispatch(request.user, container, incoming_args = ['check','--all'])

            # print(response, type(response), isinstance(response, ExceptionCommandResponse), isinstance(response, CheckFailCommandResponse))
            if isinstance(response, ExceptionCommandResponse):
                log_strategy.set_as_fail('The obdc container could not be started.')
            elif isinstance(response, CheckFailCommandResponse):
                try:
                    response, log_strategy = GatewayContainerLoader.dispatch(request.user, container, incoming_args = ['check','--fix'])
                    if isinstance(response, ExceptionCommandResponse):
                        log_and_raise_error(Exception('Failed to fix checks.'))
                        return
                except Exception as e:
                    log_strategy.set_as_fail(f'{str(e).strip(".")}.')
                    log_and_raise_error(Exception(f'Failed on checks: {str(e).strip(".")}.'))
                    return
            else:
                log_strategy.set_as_ready()


        # Run the dispatch in a future thread
        executor = ThreadPoolExecutor(max_workers=1)
        executor.submit(run_dispatch)
        executor.shutdown(wait=False)

        return render(request, 'admin/data/container/view.html', context)
        
    def container_log_view(self, request, pk):
        container: Container = get_object_or_404(Container, pk=pk)
        after_id: int = request.GET.get('after', 0)
        # Convert to int (request.GET.get returns string)
        try:
            after_id = int(after_id)
        except (ValueError, TypeError):
            after_id = 0
        
        log_repository: GatewayContainerLogRepository = GatewayContainerLogRepository()
        
        # Get logs after the given ID to avoid repetition
        logs = log_repository.get_log_after(container_id=str(pk), log_id=after_id)
        
        # Format the log lines
        lines = []
        last_id = after_id
        last_level = None
        
        # If it's the first load (after_id=0), check the last log to get current status
        if after_id == 0:
            last_log = container.logs.order_by('-id').first()
            if last_log:
                last_level = last_log.level
                last_id = last_log.id
        
        # If there are new logs, process them
        for log in logs:
            timestamp = log.dispatched_at.strftime('%H:%M:%S')
            lines.append((timestamp, log.level, log.message))
            last_id = log.id
            last_level = log.level
        
        # Create the response
        finished = not logs.exists() or False  # For future use
        
        return render(request, 'admin/data/container/log_partial.html', {
            'container': container,
            'lines': lines,
            'last_line': last_id,
            'last_level': last_level,
            'finished': finished,
        })

@admin.register(ContainerLog)
class ContainerLogAdmin(ModelAdmin):
    list_display = ['container', 'level', 'message', 'dispatched_at']
    list_filter = ['container', 'level', 'dispatched_at']
    search_fields = ['message']
    readonly_fields = ['container', 'level', 'message', 'dispatched_at']
    date_hierarchy = 'dispatched_at'