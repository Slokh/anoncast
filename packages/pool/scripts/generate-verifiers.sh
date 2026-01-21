#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POOL_DIR="$(dirname "$SCRIPT_DIR")"
CIRCUITS_DIR="$POOL_DIR/src/circuits"
CONTRACTS_DIR="$POOL_DIR/../contracts/src/verifiers"

echo -e "${YELLOW}=== AnonPool Verifier Generator ===${NC}"
echo ""

# Check for required tools
check_tool() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}Error: $1 is not installed${NC}"
        echo "Please install $1 first"
        exit 1
    fi
}

echo "Checking required tools..."
check_tool "nargo"
check_tool "bb"
echo -e "${GREEN}✓ All tools found${NC}"
echo ""

# Create output directory
mkdir -p "$CONTRACTS_DIR"

# Function to generate verifier for a circuit
generate_verifier() {
    local circuit_name=$1
    local circuit_dir="$CIRCUITS_DIR/$circuit_name"
    local output_name=$2

    echo -e "${YELLOW}Processing $circuit_name circuit...${NC}"

    # Check circuit exists
    if [ ! -d "$circuit_dir" ]; then
        echo -e "${RED}Error: Circuit directory not found: $circuit_dir${NC}"
        return 1
    fi

    cd "$circuit_dir"

    # Step 1: Compile the circuit
    echo "  [1/3] Compiling circuit..."
    nargo compile 2>&1 | sed 's/^/       /'

    # Find the compiled artifact
    local artifact_name
    if [ -f "target/anon_${circuit_name}.json" ]; then
        artifact_name="anon_${circuit_name}"
    elif [ -f "target/${circuit_name}.json" ]; then
        artifact_name="${circuit_name}"
    else
        # Try to find any json file
        artifact_name=$(ls target/*.json 2>/dev/null | head -1 | xargs basename | sed 's/.json//')
    fi

    if [ -z "$artifact_name" ] || [ ! -f "target/${artifact_name}.json" ]; then
        echo -e "${RED}Error: Could not find compiled circuit artifact${NC}"
        return 1
    fi

    echo "       Found artifact: ${artifact_name}.json"

    # Step 2: Generate verification key
    echo "  [2/3] Generating verification key..."
    bb write_vk -b "target/${artifact_name}.json" -o "target/vk" 2>&1 | sed 's/^/       /'

    # Step 3: Generate Solidity verifier
    echo "  [3/3] Generating Solidity verifier..."
    local output_file="$CONTRACTS_DIR/${output_name}.sol"
    bb contract -k "target/vk" -o "$output_file" 2>&1 | sed 's/^/       /'

    # Post-process the generated contract to add our header and rename
    if [ -f "$output_file" ]; then
        # Read the generated content
        local temp_file=$(mktemp)

        # Add header and modify contract name
        cat > "$temp_file" << EOF
// SPDX-License-Identifier: MIT
// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated from: packages/pool/src/circuits/${circuit_name}/src/main.nr
// Generated at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
//
// To regenerate: cd packages/pool && ./scripts/generate-verifiers.sh

EOF

        # Append the generated contract, removing duplicate SPDX and replacing the contract name
        # Remove any SPDX-License-Identifier lines from the original (we added our own above)
        sed -e '/^\/\/ SPDX-License-Identifier:/d' -e "s/contract UltraVerifier/contract ${output_name}/" "$output_file" >> "$temp_file"
        mv "$temp_file" "$output_file"

        echo -e "  ${GREEN}✓ Generated: $output_file${NC}"
    else
        echo -e "${RED}Error: Failed to generate verifier${NC}"
        return 1
    fi

    cd - > /dev/null
}

# Generate both verifiers
echo ""
generate_verifier "withdraw" "WithdrawVerifier"
echo ""
generate_verifier "transfer" "TransferVerifier"

echo ""
echo -e "${GREEN}=== Verifier Generation Complete ===${NC}"
echo ""
echo "Generated files:"
echo "  - $CONTRACTS_DIR/WithdrawVerifier.sol"
echo "  - $CONTRACTS_DIR/TransferVerifier.sol"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Review the generated contracts"
echo "  2. Run tests: cd packages/contracts && forge test"
echo "  3. Deploy to testnet for integration testing"
