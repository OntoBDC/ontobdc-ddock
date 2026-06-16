FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set work directory
WORKDIR /app

# Install system dependencies (including gettext for translations and build tools)
RUN apt-get update && apt-get install -y gettext gcc g++ make && rm -rf /var/lib/apt/lists/*

# Upgrade pip and install dependencies
COPY src/requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && \
    pip install django django-unfold && \
    if [ -f requirements.txt ]; then \
        pip install -r requirements.txt && \
        pip list --outdated | grep -v "^\-e" | tail -n +3 | cut -d' ' -f1 | xargs -n1 pip install -U; \
    fi

# Copy the entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Run the entrypoint
ENTRYPOINT ["/entrypoint.sh"]
