#!/usr/bin/env python3
import os
import sys

# Adiciona o diretório atual ao PATH para encontrar o Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

try:
    import django
    from django.core.management import execute_from_command_line
    django.setup()
    execute_from_command_line(['manage.py', 'compilemessages'])
    print("✓ Mensagens compiladas com sucesso!")
except ImportError as e:
    print(f"✗ Erro: Django não encontrado. {e}")
    print("Por favor, ative o ambiente virtual ou instale as dependências: pip install -r requirements.txt")
