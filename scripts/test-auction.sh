#!/bin/bash
# Wrapper script for auction tests
# Starts a dev server with a test database, runs tests, cleans up

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TEST_DB_PATH="$ROOT_DIR/apps/web/data/test-auction.db"
TEST_PORT=3001
API_URL="http://localhost:$TEST_PORT"

# Cleanup function
cleanup() {
  echo ""
  echo "Cleaning up..."

  # Kill the test server if running
  if [ -n "$SERVER_PID" ]; then
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
  fi

  # Remove test database files
  rm -f "$TEST_DB_PATH" "$TEST_DB_PATH-wal" "$TEST_DB_PATH-shm"

  echo "Done."
}

# Set up cleanup on exit
trap cleanup EXIT

# Remove any existing test database
rm -f "$TEST_DB_PATH" "$TEST_DB_PATH-wal" "$TEST_DB_PATH-shm"

echo "Starting test server on port $TEST_PORT..."

# Start the dev server with test database
cd "$ROOT_DIR/apps/web"
AUCTION_DB_PATH="$TEST_DB_PATH" PORT=$TEST_PORT bun run dev &
SERVER_PID=$!

# Wait for server to be ready
echo "Waiting for server to be ready..."
for i in {1..30}; do
  if curl -s "http://localhost:$TEST_PORT/api/auction/current" > /dev/null 2>&1; then
    echo "Server is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Server failed to start"
    exit 1
  fi
  sleep 1
done

# Run the tests
echo ""
cd "$ROOT_DIR"
API_URL="$API_URL" bun run scripts/test-auction.ts
TEST_EXIT_CODE=$?

exit $TEST_EXIT_CODE
