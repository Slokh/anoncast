#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PROTOCOL_DIR="$ROOT_DIR/packages/protocol"
WEB_DIR="$ROOT_DIR/apps/web"

# Default to Base mainnet RPC
DEFAULT_FORK_URL="https://mainnet.base.org"
ANON_TOKEN="0x0Db510e79909666d6dEc7f5e49370838c16D950f"

# Anvil test account #0
TEST_ACCOUNT="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
TEST_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Known whale address holding $ANON
WHALE_ADDRESS="0x8117efF53BA83D42408570c69C6da85a2Bb6CA05"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   AnonPool Local Development Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Parse arguments
FORK_URL="$DEFAULT_FORK_URL"
FORK_BLOCK=""
SKIP_CIRCUITS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --fork)
            FORK_URL="$2"
            shift 2
            ;;
        --fork-block)
            FORK_BLOCK="$2"
            shift 2
            ;;
        --skip-circuits)
            SKIP_CIRCUITS=true
            shift
            ;;
        --help)
            echo "Usage: ./scripts/local-dev.sh [options]"
            echo ""
            echo "Options:"
            echo "  --fork <rpc-url>      Fork from a specific RPC (default: Base mainnet)"
            echo "  --fork-block <num>    Fork from specific block number"
            echo "  --skip-circuits       Skip circuit compilation (faster startup)"
            echo "  --help                Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./scripts/local-dev.sh                           # Full setup"
            echo "  ./scripts/local-dev.sh --skip-circuits           # Skip circuit build"
            echo "  ./scripts/local-dev.sh --fork https://sepolia.base.org"
            echo ""
            echo "After setup, run e2e tests with:"
            echo "  POOL_ADDRESS=0x... bun run test:e2e"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Check dependencies
check_dependency() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}Error: $1 is not installed${NC}"
        echo "Please install $1 first"
        exit 1
    fi
}

echo "Checking dependencies..."
check_dependency "anvil"
check_dependency "forge"
check_dependency "cast"
check_dependency "bun"
check_dependency "nargo"
check_dependency "bb"
echo -e "${GREEN}✓ All dependencies found${NC}"
echo ""

# Reset database state
echo "Resetting database state..."
rm -f "$WEB_DIR/data/auction.db" "$WEB_DIR/data/auction.db-wal" "$WEB_DIR/data/auction.db-shm"
echo -e "${GREEN}✓ Database reset${NC}"
echo ""

# Build circuits and regenerate verifiers
if [ "$SKIP_CIRCUITS" = true ]; then
    echo -e "${YELLOW}Skipping circuit compilation (--skip-circuits)${NC}"
    echo ""
else
    echo "Building circuits and regenerating verifiers..."
    cd "$ROOT_DIR"
    bun run build:circuits 2>&1 | grep -E "(Processing|Generated|✓|Compiling)" || true
    echo -e "${GREEN}✓ Circuits built and verifiers regenerated${NC}"
    echo ""
fi

# Build Anvil command
ANVIL_CMD="anvil --host 0.0.0.0 --auto-impersonate --fork-url $FORK_URL"

echo -e "${YELLOW}Forking from: $FORK_URL${NC}"
if [ -n "$FORK_BLOCK" ]; then
    ANVIL_CMD="$ANVIL_CMD --fork-block-number $FORK_BLOCK"
    echo -e "${YELLOW}At block: $FORK_BLOCK${NC}"
fi
echo ""

# Kill any existing Anvil process
if pgrep -x "anvil" > /dev/null; then
    echo "Stopping existing Anvil process..."
    pkill -x "anvil" || true
    sleep 1
fi

# Start Anvil in background
echo "Starting Anvil..."
$ANVIL_CMD &> /tmp/anvil.log &
ANVIL_PID=$!

# Wait for Anvil to be ready
echo "Waiting for Anvil to start..."
for i in {1..30}; do
    if cast chain-id --rpc-url http://127.0.0.1:8545 &> /dev/null; then
        break
    fi
    sleep 0.5
done

if ! cast chain-id --rpc-url http://127.0.0.1:8545 &> /dev/null; then
    echo -e "${RED}Failed to start Anvil${NC}"
    cat /tmp/anvil.log
    exit 1
fi

CHAIN_ID=$(cast chain-id --rpc-url http://127.0.0.1:8545)
echo -e "${GREEN}✓ Anvil running (Chain ID: $CHAIN_ID, PID: $ANVIL_PID)${NC}"
echo ""

# Fund test account with $ANON tokens
echo "Funding test account with \$ANON tokens..."
TRANSFER_AMOUNT="1000000000000000000000" # 1,000 ANON (18 decimals)

WHALE_BALANCE=$(cast call $ANON_TOKEN "balanceOf(address)(uint256)" $WHALE_ADDRESS --rpc-url http://127.0.0.1:8545 2>/dev/null || echo "0")
echo "  Whale balance: $WHALE_BALANCE"

if [ "$WHALE_BALANCE" != "0" ]; then
    cast send $ANON_TOKEN "transfer(address,uint256)(bool)" $TEST_ACCOUNT $TRANSFER_AMOUNT \
        --from $WHALE_ADDRESS \
        --unlocked \
        --rpc-url http://127.0.0.1:8545 \
        &> /dev/null

    TEST_BALANCE=$(cast call $ANON_TOKEN "balanceOf(address)(uint256)" $TEST_ACCOUNT --rpc-url http://127.0.0.1:8545)
    echo -e "${GREEN}✓ Transferred 1,000 \$ANON to test account${NC}"
    echo "  Test account balance: $TEST_BALANCE"
else
    echo -e "${YELLOW}⚠ Could not fund test account (whale has no balance)${NC}"
    echo "  You may need to find a different whale address"
fi
echo ""

# Deploy contracts
echo "Deploying contracts..."
cd "$PROTOCOL_DIR"

DEPLOY_OUTPUT=$(forge script script/DeployLocal.s.sol:DeployLocal \
    --rpc-url http://127.0.0.1:8545 \
    --broadcast \
    2>&1)

echo "$DEPLOY_OUTPUT"

# Extract addresses from output
POOL_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "AnonPool:" | awk '{print $2}')
GATEWAY_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "AnonPoolGateway:" | awk '{print $2}')
AUCTION_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "AnonPoolAuctionSpender:" | awk '{print $2}')

if [ -z "$POOL_ADDRESS" ]; then
    echo -e "${RED}Failed to extract contract addresses${NC}"
    exit 1
fi

cd "$ROOT_DIR"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Update root .env file with contract addresses
ENV_FILE="$ROOT_DIR/.env"

# Create .env from .env.example if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$ROOT_DIR/.env.example" ]; then
        cp "$ROOT_DIR/.env.example" "$ENV_FILE"
        echo -e "${YELLOW}Created .env from .env.example${NC}"
    else
        echo -e "${RED}Error: .env.example not found${NC}"
        exit 1
    fi
fi

# Update .env with local development values (preserves other settings)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS sed requires empty string for -i
    sed -i '' "s|^NEXT_PUBLIC_RPC_URL=.*|NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545|" "$ENV_FILE"
    sed -i '' "s|^NEXT_PUBLIC_POOL_CONTRACT=.*|NEXT_PUBLIC_POOL_CONTRACT=$POOL_ADDRESS|" "$ENV_FILE"
    sed -i '' "s|^NEXT_PUBLIC_GATEWAY_CONTRACT=.*|NEXT_PUBLIC_GATEWAY_CONTRACT=$GATEWAY_ADDRESS|" "$ENV_FILE"
    sed -i '' "s|^NEXT_PUBLIC_AUCTION_CONTRACT=.*|NEXT_PUBLIC_AUCTION_CONTRACT=$AUCTION_ADDRESS|" "$ENV_FILE"
else
    # Linux sed
    sed -i "s|^NEXT_PUBLIC_RPC_URL=.*|NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545|" "$ENV_FILE"
    sed -i "s|^NEXT_PUBLIC_POOL_CONTRACT=.*|NEXT_PUBLIC_POOL_CONTRACT=$POOL_ADDRESS|" "$ENV_FILE"
    sed -i "s|^NEXT_PUBLIC_GATEWAY_CONTRACT=.*|NEXT_PUBLIC_GATEWAY_CONTRACT=$GATEWAY_ADDRESS|" "$ENV_FILE"
    sed -i "s|^NEXT_PUBLIC_AUCTION_CONTRACT=.*|NEXT_PUBLIC_AUCTION_CONTRACT=$AUCTION_ADDRESS|" "$ENV_FILE"
fi

echo -e "${GREEN}✓ Updated $ENV_FILE with contract addresses${NC}"
echo ""

# Print summary
echo -e "${BLUE}Contract Addresses:${NC}"
echo "  \$ANON Token:  $ANON_TOKEN"
echo "  AnonPool:     $POOL_ADDRESS"
echo "  Gateway:      $GATEWAY_ADDRESS"
echo "  Auction:      $AUCTION_ADDRESS"
echo ""

echo -e "${BLUE}Test Account (Anvil #0):${NC}"
echo "  Address:  $TEST_ACCOUNT"
echo "  Key:      $TEST_PRIVATE_KEY"
FINAL_BALANCE=$(cast call $ANON_TOKEN "balanceOf(address)(uint256)" $TEST_ACCOUNT --rpc-url http://127.0.0.1:8545 2>/dev/null || echo "0")
FORMATTED_BALANCE=$(echo "scale=0; $FINAL_BALANCE / 1000000000000000000" | bc 2>/dev/null || echo "?")
echo "  \$ANON:    $FORMATTED_BALANCE tokens"
echo "  ETH:      10,000 ETH"
echo ""

echo -e "${BLUE}Anvil:${NC}"
echo "  RPC URL:  http://127.0.0.1:8545"
echo "  Chain ID: $CHAIN_ID"
echo "  PID:      $ANVIL_PID"
echo "  Logs:     tail -f /tmp/anvil.log"
echo ""

echo -e "${YELLOW}Next steps:${NC}"
echo "  Start frontend:  bun run dev"
echo "  Run e2e tests:   POOL_ADDRESS=$POOL_ADDRESS bun run test:e2e"
echo "  Stop Anvil:      kill $ANVIL_PID"
echo ""

# Keep script running and show Anvil output
echo -e "${GREEN}Anvil is running. Press Ctrl+C to stop.${NC}"
echo ""

# Trap Ctrl+C to clean up
trap "echo ''; echo 'Stopping Anvil...'; kill $ANVIL_PID 2>/dev/null; exit 0" INT

# Follow Anvil logs
tail -f /tmp/anvil.log
