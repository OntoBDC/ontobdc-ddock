from django.contrib import admin
from django.urls import path, reverse
from django.http import HttpResponseRedirect
from django.shortcuts import render, get_object_or_404
from django.contrib import messages
from django.utils.html import format_html
from unfold.admin import ModelAdmin
from .models import Container

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
            'title': f'Ver Container: {container.name}',
            'opts': self.model._meta,
            'container': container,
        }
        return render(request, 'admin/data/container/view.html', context)