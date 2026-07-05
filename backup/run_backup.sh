#!/bin/bash
# ==============================================================================
# Hotel Santosh - Daily Database Backup Wrapper Script
# ==============================================================================

# Set working directory to the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Path to python in virtual environment
VENV_PYTHON="../backend/venv/bin/python"

if [ ! -f "$VENV_PYTHON" ]; then
    echo "Error: Virtual environment python not found at $VENV_PYTHON"
    exit 1
fi

echo "=== Backup started at $(date) ==="

# Execute the backup script with the backend virtual environment's python
# and include the backend directory in python path just in case
PYTHONPATH="../backend" "$VENV_PYTHON" backup.py

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "=== Backup completed successfully at $(date) ==="
else
    echo "=== Backup failed with exit code $EXIT_CODE at $(date) ==="
fi

exit $EXIT_CODE
