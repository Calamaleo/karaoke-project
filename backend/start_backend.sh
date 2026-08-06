#!/bin/bash
cd /app/backend
source ../.venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8000