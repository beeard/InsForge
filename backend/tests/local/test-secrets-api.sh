#!/bin/bash

# Secrets Management API test script

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source "$SCRIPT_DIR/../test-config.sh"

echo "🧪 Testing secrets management API..."

API_BASE="$TEST_API_BASE"
ADMIN_TOKEN=""
SECRET_KEY="TEST_SECRET_$(date +%s)"

# Get admin token
echo "🔑 Getting admin token..."
ADMIN_TOKEN=$(get_admin_token)

if [ -z "$ADMIN_TOKEN" ]; then
    print_fail "Failed to get admin token"
    exit 1
fi
print_success "Got admin token"
echo ""

# 1. Create secret
echo "📝 Creating secret..."
create_response=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/secrets" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "key": "'$SECRET_KEY'",
        "value": "my-secret-value-123",
        "isReserved": false
    }')

status=$(echo "$create_response" | tail -n 1)
body=$(echo "$create_response" | head -n -1)

if [ "$status" -eq 201 ]; then
    print_success "Secret created"
    echo "Key: $SECRET_KEY"
else
    print_fail "Failed to create secret (status: $status)"
    echo "Response: $body"
    track_test_failure
fi
echo ""

# 2. List all secrets (should hide values)
echo "📋 Listing all secrets..."
list_response=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/secrets" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

status=$(echo "$list_response" | tail -n 1)
body=$(echo "$list_response" | head -n -1)

if [ "$status" -eq 200 ] && echo "$body" | grep -q "$SECRET_KEY"; then
    print_success "Listed secrets successfully"
else
    print_fail "Failed to list secrets (status: $status)"
    echo "Response: $body"
    track_test_failure
fi
echo ""

# 3. Get specific secret value
echo "🔍 Getting secret value..."
get_response=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/secrets/$SECRET_KEY" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

status=$(echo "$get_response" | tail -n 1)
body=$(echo "$get_response" | head -n -1)

if [ "$status" -eq 200 ] && echo "$body" | grep -q '"value"'; then
    print_success "Retrieved secret value"
else
    print_fail "Failed to get secret value (status: $status)"
    echo "Response: $body"
    track_test_failure
fi
echo ""

# 4. Update secret
echo "✏️ Updating secret..."
update_response=$(curl -s -w "\n%{http_code}" -X PUT "$API_BASE/secrets/$SECRET_KEY" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "value": "updated-secret-value-456"
    }')

status=$(echo "$update_response" | tail -n 1)
body=$(echo "$update_response" | head -n -1)

if [ "$status" -eq 200 ]; then
    print_success "Secret updated"
else
    print_fail "Failed to update secret (status: $status)"
    echo "Response: $body"
    track_test_failure
fi
echo ""

# 5. Delete secret
echo "🗑️ Deleting secret..."
delete_response=$(curl -s -w "\n%{http_code}" -X DELETE "$API_BASE/secrets/$SECRET_KEY" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

status=$(echo "$delete_response" | tail -n 1)
body=$(echo "$delete_response" | head -n -1)

if [ "$status" -eq 200 ]; then
    print_success "Secret deleted"
else
    print_fail "Failed to delete secret (status: $status)"
    echo "Response: $body"
    track_test_failure
fi
echo ""

print_success "🎉 Secrets management API test completed!"
