#!/usr/bin/env bash
set -e

# Deploy all Supabase Edge Functions in this directory.
# Requires the Supabase CLI and the environment variable SUPABASE_PROJECT_REF to be set.
# Optionally, you can set SUPABASE_ACCESS_TOKEN if not already logged in.

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$SCRIPT_DIR"

for dir in */; do
  func=$(basename "$dir")
  echo "Deploying $func..."
  supabase functions deploy "$func" --project-ref "$SUPABASE_PROJECT_REF"
done
