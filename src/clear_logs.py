#!/usr/bin/env python3
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

import django
django.setup()

from data.models import ContainerLog

print(f"Excluindo {ContainerLog.objects.count()} registros de log...")
ContainerLog.objects.all().delete()
print("✓ Todos os logs foram excluídos!")
