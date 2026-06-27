#!/bin/bash

# Function to clean up containers on script termination
cleanup() {
  echo -e "\n🛑 Stopping backend microservices..."
  docker-compose down
  echo "👋 Done!"
  exit 0
}

# Trap Ctrl+C (SIGINT) and exit (SIGTERM)
trap cleanup SIGINT SIGTERM

echo "🚀 Starting Stranger Match & Friends Microservices Platform..."

# 1. Start backend containers in the background
echo "📦 Building and starting backend microservices (MongoDB, Redis, Gateway, Auth, Chat, Notifications)..."
docker-compose up --build -d

# 2. Check and install frontend dependencies
if [ ! -d "frontend/node_modules" ]; then
  echo "📦 Installing Next.js frontend dependencies..."
  (cd frontend && npm install)
fi

# 3. Run frontend development server in foreground
echo "✨ Launching frontend Next.js dev server..."
echo "👉 Open http://localhost:3000 to access the application"
cd frontend && npm run dev
