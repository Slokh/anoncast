#!/bin/bash
set -e

# Load environment variables
if [ -f .env ]; then
    source .env
fi

# Check required env vars
if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo "Error: DEPLOYER_PRIVATE_KEY not set"
    exit 1
fi

if [ -z "$WITHDRAW_VERIFIER" ]; then
    echo "Error: WITHDRAW_VERIFIER not set (deploy ZK verifier first)"
    exit 1
fi

if [ -z "$TRANSFER_VERIFIER" ]; then
    echo "Error: TRANSFER_VERIFIER not set (deploy ZK verifier first)"
    exit 1
fi

if [ -z "$SPENDER_ADDRESS" ]; then
    echo "Error: SPENDER_ADDRESS not set (server wallet for transfers)"
    exit 1
fi

# Default RPC URL if not set
BASE_SEPOLIA_RPC_URL=${BASE_SEPOLIA_RPC_URL:-"https://sepolia.base.org"}

echo "Deploying to Base Sepolia..."

# Run forge script and capture output
OUTPUT=$(forge script script/Deploy.s.sol:DeployTestnet \
    --rpc-url "$BASE_SEPOLIA_RPC_URL" \
    --broadcast \
    ${BASESCAN_API_KEY:+--verify} \
    2>&1)

echo "$OUTPUT"

# Parse addresses from output
TEST_TOKEN=$(echo "$OUTPUT" | grep "TestANON deployed to:" | awk '{print $4}')
POOL=$(echo "$OUTPUT" | grep "AnonPool deployed to:" | awk '{print $4}')

if [ -z "$TEST_TOKEN" ] || [ -z "$POOL" ]; then
    echo "Error: Could not parse deployed addresses"
    exit 1
fi

echo ""
echo "=== Deployment Successful ==="
echo "TestANON: $TEST_TOKEN"
echo "AnonPool: $POOL"
echo ""

# Update apps/web/.env.local
WEB_ENV="../../apps/web/.env.local"

# Create .env.local if it doesn't exist
if [ ! -f "$WEB_ENV" ]; then
    touch "$WEB_ENV"
fi

# Function to update or add env var
update_env() {
    local key=$1
    local value=$2
    local file=$3

    if grep -q "^${key}=" "$file" 2>/dev/null; then
        # Update existing
        sed -i '' "s|^${key}=.*|${key}=${value}|" "$file"
    else
        # Add new
        echo "${key}=${value}" >> "$file"
    fi
}

update_env "NEXT_PUBLIC_TESTNET_ANON_TOKEN" "$TEST_TOKEN" "$WEB_ENV"
update_env "NEXT_PUBLIC_ANON_POOL_CONTRACT" "$POOL" "$WEB_ENV"

echo "Updated $WEB_ENV with contract addresses"
echo ""
echo "Run the app with: bun run dev:testnet"
