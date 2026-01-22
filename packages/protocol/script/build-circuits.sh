#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROTOCOL_DIR="$(dirname "$SCRIPT_DIR")"
CIRCUITS_DIR="$PROTOCOL_DIR/circuits"
CONTRACTS_DIR="$PROTOCOL_DIR/contracts/verifiers"

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

# Function to add typed wrapper functions to generated verifiers
add_wrapper_function() {
    local output_file=$1
    local circuit_name=$2

    # Find the closing brace of the contract and insert wrapper before it
    local wrapper_code=""

    if [ "$circuit_name" = "withdraw" ]; then
        wrapper_code='
    /// @notice Typed wrapper for withdraw proof verification
    /// @dev Converts typed parameters to bytes32 array and calls base verify
    /// @param proof The ZK proof bytes
    /// @param nullifierHash Hash of the nullifier being spent
    /// @param root The Merkle root being proven against
    /// @param amount The amount being withdrawn
    /// @param recipient The address receiving the withdrawal
    /// @return True if the proof is valid
    function verify(
        bytes calldata proof,
        bytes32 nullifierHash,
        bytes32 root,
        uint256 amount,
        address recipient
    ) external view returns (bool) {
        bytes32[] memory publicInputs = new bytes32[](4);
        publicInputs[0] = nullifierHash;
        publicInputs[1] = root;
        publicInputs[2] = bytes32(amount);
        publicInputs[3] = bytes32(uint256(uint160(recipient)));
        return this.verify(proof, publicInputs);
    }
'
    elif [ "$circuit_name" = "transfer" ]; then
        wrapper_code='
    /// @notice Typed wrapper for transfer proof verification
    /// @dev Converts typed parameters to bytes32 array and calls base verify
    /// @param proof The ZK proof bytes
    /// @param nullifierHash Hash of the nullifier being spent
    /// @param root The Merkle root being proven against
    /// @param outputCommitment Commitment for the recipient note
    /// @param outputAmount Amount in the output note
    /// @param changeCommitment Commitment for the change note
    /// @param changeAmount Amount in the change note
    /// @return True if the proof is valid
    function verify(
        bytes calldata proof,
        bytes32 nullifierHash,
        bytes32 root,
        bytes32 outputCommitment,
        uint256 outputAmount,
        bytes32 changeCommitment,
        uint256 changeAmount
    ) external view returns (bool) {
        bytes32[] memory publicInputs = new bytes32[](6);
        publicInputs[0] = nullifierHash;
        publicInputs[1] = root;
        publicInputs[2] = bytes32(outputAmount);
        publicInputs[3] = changeCommitment;
        publicInputs[4] = bytes32(changeAmount);
        publicInputs[5] = outputCommitment;
        return this.verify(proof, publicInputs);
    }
'
    fi

    if [ -n "$wrapper_code" ]; then
        # Find the contract's closing brace and insert wrapper before it
        # HonkVerifier has helper functions outside the contract, so we can't just use the last line
        # Strategy: Find "// Conversion util" comment which marks code after the contract ends
        local temp_file=$(mktemp)

        # Check if this is a HonkVerifier (has convertPoints function outside contract)
        local conversion_line=$(grep -n "// Conversion util" "$output_file" | head -1 | cut -d: -f1)

        if [ -n "$conversion_line" ]; then
            # HonkVerifier format: contract ends 2 lines before "// Conversion util"
            # Structure is: }  }  // Conversion util
            local contract_end_line=$((conversion_line - 2))

            # Get everything up to but not including the contract's closing brace
            head -n $((contract_end_line - 1)) "$output_file" > "$temp_file"
            # Add wrapper code
            echo "$wrapper_code" >> "$temp_file"
            # Add the contract's closing brace
            echo "}" >> "$temp_file"
            # Add everything after (the helper functions)
            tail -n +$((contract_end_line + 1)) "$output_file" >> "$temp_file"
        else
            # Old UltraPlonk format: file ends with contract's closing brace
            local total_lines=$(wc -l < "$output_file")
            local lines_to_keep=$((total_lines - 1))
            head -n "$lines_to_keep" "$output_file" > "$temp_file"
            echo "$wrapper_code" >> "$temp_file"
            echo "}" >> "$temp_file"
        fi

        mv "$temp_file" "$output_file"
    fi
}

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
    # Using --oracle_hash keccak for EVM-compatible verification (bb 0.82.2 syntax)
    # bb 0.82.2 expects -o to be a directory, outputs to <dir>/vk
    echo "  [2/3] Generating verification key..."
    rm -rf "target/vk" "target/vk.json"  # Clean up old files
    bb write_vk --oracle_hash keccak -b "target/${artifact_name}.json" -o "target" 2>&1 | sed 's/^/       /'

    # Also generate vk.json for client-side proof generation
    node -e "const fs=require('fs');fs.writeFileSync('target/vk.json',JSON.stringify(Array.from(fs.readFileSync('target/vk'))))"
    echo "       Generated vk.json for client"

    # Step 3: Generate Solidity verifier
    echo "  [3/3] Generating Solidity verifier..."
    local output_file="$CONTRACTS_DIR/${output_name}.sol"
    bb write_solidity_verifier -k "target/vk" -o "$output_file" 2>&1 | sed 's/^/       /'

    # Post-process the generated contract to add our header and rename
    if [ -f "$output_file" ]; then
        # Read the generated content
        local temp_file=$(mktemp)

        # Add header and modify contract name
        cat > "$temp_file" << EOF
// SPDX-License-Identifier: MIT
// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated from: packages/protocol/circuits/${circuit_name}/src/main.nr
// Generated at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
//
// To regenerate: cd packages/protocol && ./scripts/generate-verifiers.sh

EOF

        # Append the generated contract, removing duplicate SPDX and replacing the contract name
        # Remove any SPDX-License-Identifier lines from the original (we added our own above)
        # Handle both UltraVerifier (UltraPlonk) and HonkVerifier (UltraHonk) contract names
        sed -e '/^\/\/ SPDX-License-Identifier:/d' -e "s/contract UltraVerifier/contract ${output_name}/" -e "s/contract HonkVerifier/contract ${output_name}/" "$output_file" >> "$temp_file"
        mv "$temp_file" "$output_file"

        # Add typed wrapper functions based on circuit type
        add_wrapper_function "$output_file" "$circuit_name"

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
echo "  2. Run tests: cd packages/protocol && forge test"
echo "  3. Deploy to testnet for integration testing"
