#!/bin/sh

# Check if the project is already initialized
if [ ! -f manage.py ]; then
  echo "manage.py not found. Initializing new Django project 'core'..."
  django-admin startproject core .
fi

# Run migrations
echo "Applying database migrations..."
python manage.py migrate

# Start the Django development server
echo "Starting Django server..."
exec python manage.py runserver 0.0.0.0:8000
