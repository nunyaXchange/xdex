#!/bin/bash

# Make bin directory if it doesn't exist
mkdir -p bin

# Make solc executable
chmod +x bin/solc

# Make resolc executable
chmod +x bin/resolc

# Add bin to PATH
export PATH="$PATH:$(pwd)/bin"

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
