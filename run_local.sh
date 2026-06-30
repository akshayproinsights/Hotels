#!/bin/bash
# =============================================================================
# run_local.sh — Santosh Palace local development helper
# =============================================================================

set -e

WORKSPACE_DIR="/root/Hotel_Santosh"

echo "=================================================="
echo "🏨 Santosh Palace Local Runner Utility"
echo "=================================================="
echo "Please select what you would like to run:"
echo "1) Start Frontend Dev Server (http://localhost:5173)"
echo "2) Build Frontend for Production (Compiles to dist/)"
echo "3) Start Backend Dev Server (http://127.0.0.1:8002)"
echo "4) Start BOTH Frontend & Backend Dev Servers"
echo "5) Exit"
echo "=================================================="
read -rp "Enter choice [1-5]: " choice

case $choice in
    1)
        echo "🚀 Starting frontend dev server..."
        cd "$WORKSPACE_DIR/frontend"
        npm run dev -- --host 0.0.0.0 --port 5173
        ;;
    2)
        echo "🏗️  Building production assets..."
        cd "$WORKSPACE_DIR/frontend"
        npm run build
        echo "✅ Build completed successfully! Updated 'dist/' folder."
        ;;
    3)
        echo "🐍 Starting backend dev server..."
        cd "$WORKSPACE_DIR/backend"
        source venv/bin/activate
        uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload
        ;;
    4)
        echo "🔥 Starting BOTH servers concurrently..."
        
        # Function to clean up background processes on Ctrl+C
        cleanup() {
            echo "🛑 Stopping servers..."
            kill "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
            exit 0
        }
        trap cleanup SIGINT SIGTERM

        # Start Backend
        echo "🐍 Launching Backend on port 8002..."
        cd "$WORKSPACE_DIR/backend"
        source venv/bin/activate
        uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload > /dev/null 2>&1 &
        BACKEND_PID=$!

        # Start Frontend
        echo "🚀 Launching Frontend on port 5173..."
        cd "$WORKSPACE_DIR/frontend"
        npm run dev -- --host 0.0.0.0 --port 5173 &
        FRONTEND_PID=$!

        echo "👉 Both servers are running. Press Ctrl+C to stop."
        wait
        ;;
    5)
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid option."
        exit 1
        ;;
esac
