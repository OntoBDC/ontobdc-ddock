#!/bin/sh

# Update pip
echo "Updating pip..."
pip install --upgrade pip

# Install requirements
if [ -f requirements.txt ]; then
  echo "Installing dependencies from requirements.txt..."
  pip install -r requirements.txt
  # Update packages without fixed versions
  echo "Updating packages without fixed versions..."
  pip list --outdated | grep -v "^\-e" | tail -n +3 | cut -d' ' -f1 | xargs -n1 pip install -U
fi

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
