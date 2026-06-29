#!/usr/bin/env bash
set -e
# Navigate to the functions directory
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$SCRIPT_DIR"
# Serve each subdirectory as a Supabase Edge Function in the background
for dir in */; do
  func=$(basename "$dir")
  echo "Serving $func..."
  # Run each serve command in background and redirect output to a log file
  supabase functions serve "$func" > "${func}_serve.log" 2>&1 &
  # Store the PID so we can kill them later if needed
  echo $! > "${func}_pid.txt"
  # Small pause to avoid race conditions
  sleep 1
done
echo "All functions are now being served locally. Use 'supabase functions logs <function>' to view logs."
