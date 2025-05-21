#!/bin/bash

# Check script usage
if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <OPENAI_API_KEY> [ENDPOINT]"
    echo "Example: $0 sk-your-api-key https://api.openai.com"
    exit 1
fi

API_KEY="$1"
ENDPOINT="${2:-https://api.openai.com}"

# Validate API key format (simple validation)
if [[ "$ENDPOINT" == "https://api.openai.com" ]] && [[ ! "$API_KEY" =~ ^sk-[A-Za-z0-9]+ ]]; then
    echo "Error: Invalid OpenAI API key format. It should start with 'sk-'"
    exit 2
fi

# Call OpenAI API using curl
echo "Retrieving OpenAI models list..."
curl -s -X GET "$ENDPOINT/v1/models" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $API_KEY" \
     -H "user-agent: Obsidian-Summar/1.1.19" | \
     jq '{object: "list", data: [.data[] | select(.owned_by == "system")]}'
     
# Check exit status
if [ $? -ne 0 ]; then
    echo "Error: API request failed"
    exit 3
fi

echo -e "\nScript execution completed"
