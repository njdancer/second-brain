#!/bin/bash

# Extract token from .env.test
TOKEN=$(grep GITHUB_OAUTH_TOKEN .env.test | cut -d= -f2)

echo "Step 1: Initialize request"
RESPONSE=$(curl -s -i -X POST https://second-brain-mcp.nick-01a.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}')

# Extract body (after blank line)
BODY=$(echo "$RESPONSE" | sed -n '/^$/,$p' | tail -n +2)
echo "$BODY" | jq .

# Extract session ID from headers
SESSION_ID=$(echo "$RESPONSE" | grep -i "mcp-session-id:" | cut -d: -f2 | tr -d ' \r')
echo ""
echo "Extracted session ID: $SESSION_ID"

echo ""
echo "Step 2: Tools/list request with session ID"
curl -s -X POST https://second-brain-mcp.nick-01a.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | jq .
