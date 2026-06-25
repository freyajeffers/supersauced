#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME=$1

echo "========================================="
echo "Running Concurrent User Profile Inserts Stress Test"
echo "========================================="

# Create a temporary file to store errors from background jobs
ERR_FILE=$(mktemp)
trap 'rm -f "$ERR_FILE"' EXIT

# Launch 10 background jobs
for i in {1..10}; do
  (
    for j in {1..50}; do
      # Generate a unique lowercase UUID and unique email
      USER_ID=$(cat /proc/sys/kernel/random/uuid | tr '[:upper:]' '[:lower:]')
      EMAIL="concurrent_user_${i}_${j}_$(date +%s%N)@test.com"
      
      # Use JSON metadata to test JSONB parsing under concurrency
      METADATA='{"onboarding_survey": {"dietary_preferences": ["keto"], "thread_id": '"$i"', "loop_id": '"$j"'}, "sauce_log": {"sku_test": 3}}'
      
      # Insert auth user. The trigger handles public.user_profiles insert.
      if ! docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
        "INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('$USER_ID', '$EMAIL', '$METADATA'::jsonb);" >/dev/null 2>&1; then
        echo "Error in thread $i, iteration $j" >> "$ERR_FILE"
      fi
    done
  ) &
done

# Wait for all background threads to complete
wait

# Read errors if any
if [ -s "$ERR_FILE" ]; then
  echo "FAIL: Concurrent inserts encountered database errors:"
  cat "$ERR_FILE"
  exit 1
fi

# Verify totals
TOTAL_USERS=$(docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -t -A -c "SELECT count(*) FROM auth.users WHERE email LIKE 'concurrent_user_%';")
TOTAL_PROFILES=$(docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -t -A -c "SELECT count(*) FROM public.user_profiles WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'concurrent_user_%');")

echo "Total concurrent users inserted: $TOTAL_USERS"
echo "Total concurrent user profiles created: $TOTAL_PROFILES"

if [ "$TOTAL_USERS" -ne 500 ]; then
  echo "FAIL: Expected 500 users, got $TOTAL_USERS"
  exit 1
fi

if [ "$TOTAL_PROFILES" -ne 500 ]; then
  echo "FAIL: Expected 500 user profiles, got $TOTAL_PROFILES"
  exit 1
fi

echo "SUCCESS: Concurrent User Profile trigger stress test completed with 0 errors!"
exit 0
