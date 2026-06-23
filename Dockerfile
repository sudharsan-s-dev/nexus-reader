# Use a lightweight python image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=5000 \
    DB_PATH=/app/backend/storage/nexus_reader.db

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements first to leverage Docker caching
COPY backend/requirements.txt ./backend/requirements.txt

# Install dependencies
RUN pip install --no-cache-dir -r backend/requirements.txt

# Pre-download EasyOCR English models during build phase
# This prevents downloading models during container startup or runtime requests
RUN python -c "import easyocr; easyocr.Reader(['en'])"

# Copy the rest of the application code
COPY backend ./backend
COPY frontend ./frontend

# Change working directory to backend so routes/services resolve correctly
WORKDIR /app/backend

# Expose target port
EXPOSE 5000

# Start Flask application using Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app", "--timeout", "120"]
