import os
from datetime import datetime
from django.conf import settings


class ContainerHealthAccessor:
    def __init__(self, service: 'ContainerFileService'):
        self.service = service

    @property
    def warnings(self):
        return 0

    @property
    def errors(self):
        return 0


class ContainerFileModifiedAccessor:
    def __init__(self, service: 'ContainerFileService'):
        self.service = service

    @property
    def last(self):
        files = self.service._list_files_deeply()
        if not files:
            return None
            
        latest_file = max(files, key=os.path.getmtime)
        
        return {
            'name': os.path.basename(latest_file),
            'date': datetime.fromtimestamp(os.path.getmtime(latest_file))
        }


class ContainerFileService:
    def __init__(self, container):
        self.container = container

    @property
    def all(self) -> 'ContainerFileService':
        return self._load()

    @property
    def count(self):
        return len(self._list_files_deeply())

    @property
    def size(self, unit: str = 'mb'):
        files = self._list_files_deeply()
        total_bytes = sum(os.path.getsize(f) for f in files if os.path.exists(f))
        return round(total_bytes / (1024 * 1024), 2)

    @property
    def modified(self):
        return ContainerFileModifiedAccessor(self)

    @property
    def health(self):
        return ContainerHealthAccessor(self)

    def _load(self) -> 'ContainerFileService':
        if not self._is_stored():
            self._create_storage()

        return self

    def _is_stored(self):
        return os.path.exists(self._get_storage_path())

    def _get_storage_path(self):
        return os.path.join(settings.CONTAINERS_STORAGE_ROOT, str(self.container.id))

    def _get_file_path(self, filename):
        return os.path.join(self._get_storage_path(), filename)

    def _list_files_deeply(self):
        self._load()
        storage_path = self._get_storage_path()
        if not os.path.exists(storage_path):
            return []
            
        all_files = []
        ignore_folders = self._ignore_package_folders()
        
        for root, dirs, files in os.walk(storage_path):
            # Ignore specific folders
            dirs[:] = [d for d in dirs if d not in ignore_folders]
            
            for file in files:
                all_files.append(os.path.join(root, file))
                
        return self._filter_files(all_files)

    def _create_storage(self):
        os.makedirs(self._get_storage_path(), exist_ok=True)

    def _ignore_file_suffixes(self):
        return ['.meta', '.index', '.lock', '.tmp', '.log', '.obdc']

    def _filter_files(self, files):
        ignore_suffixes = self._ignore_file_suffixes()
        ignore_configs = self._ignore_config_files()
        
        filtered = []
        for f in files:
            basename = os.path.basename(f)
            
            if any(basename.endswith(s) for s in ignore_suffixes):
                continue
                
            if basename in ignore_configs:
                continue
                
            filtered.append(f)
            
        return filtered

    def _get_file_size(self, filename):
        return os.path.getsize(self._get_file_path(filename))

    def _ignore_config_files(self):
        return ['dataset.properties', 'dataset.ttl', 'nid.ttl', 'nid.properties']

    def _ignore_package_folders(self):
        return ['linkset', 'ontology', '__ontobdc__', '.__ontobdc__']
