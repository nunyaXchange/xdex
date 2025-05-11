#!/bin/bash

# Make binaries directory if it doesn't exist
mkdir -p binaries

# Make solc executable
chmod +x binaries/solc

# Make resolc executable
chmod +x binaries/resolc

# Add binaries to PATH
export PATH="$PATH:$(pwd)/binaries"

# Verify solc is accessible
if ! command -v solc &> /dev/null; then
    echo "Error: solc is not accessible"
    exit 1
fi

# Verify resolc is accessible
if ! command -v resolc &> /dev/null; then
    echo "Error: resolc is not accessible"
    exit 1
fi

echo "Compilers setup completed successfully"
