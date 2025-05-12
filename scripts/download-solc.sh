#!/bin/bash

# Create bin directory if it doesn't exist
mkdir -p bin

# Download the latest solc binary based on platform
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    curl -L https://github.com/ethereum/solidity/releases/download/v0.8.20/solc-macos -o bin/solc
    xattr -c bin/solc
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    curl -L https://github.com/ethereum/solidity/releases/download/v0.8.20/solc-static-linux -o bin/solc
else
    # Windows
    curl -L https://github.com/ethereum/solidity/releases/download/v0.8.20/solc-windows.exe -o bin/solc.exe
fi

# Make the binary executable (Unix only)
if [[ "$OSTYPE" != "msys" && "$OSTYPE" != "win32" ]]; then
    chmod +x bin/solc
fi

echo "solc binary downloaded successfully"
