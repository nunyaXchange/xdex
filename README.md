# Hardhat Lending System Example

A lending system implemented using Solidity smart contracts for Ethereum and Polkadot's Westend Asset Hub using PolkaVM.

## Features

1. Lending Pool Management
   - Deposit and withdraw assets
   - Collateral management
   - Liquidation handling

2. Variable Total Liquidity (VTL) Matching
   - Lenders specify VTL range (e.g., 1.3-1.6)
   - Borrowers specify VTL range (e.g., 1.4-1.8)
   - Efficient matching algorithm in Solidity

3. Collateral Management
   - Minimum collateral ratio: 1.4x
   - Liquidation threshold: 1.6x
   - Oracle-based price feeds
   - Automated liquidation process

## Important Notes

### Price Oracle Implementation
The current price oracle implementation is centralized - prices are set by the contract owner rather than being fetched from an external source like Chainlink. In a production environment, you would want to:

1. Use a decentralized oracle network
2. Add multiple price sources
3. Implement price aggregation logic
4. Add more safety checks on price validity

#### Using the Price Oracle

1. **Setting Asset Prices** (Owner Only):
```javascript
// Price must be in wei (18 decimals)
const price = ethers.parseEther("100"); // $100
await priceOracle.updateAssetPrice(assetAddress, price);
```

2. **Getting Asset Prices**:
```javascript
// Get latest price (reverts if price is inactive)
const price = await priceOracle.getLatestPrice(assetAddress);

// Check if price is active (older than 1 hour = inactive)
const isActive = await priceOracle.isPriceActive(assetAddress);
```

3. **Calculating Collateral Ratio**:
```javascript
// Returns ratio in percentage (e.g., 200 = 200% or 2x)
const ratio = await priceOracle.calculateCollateralRatio(
    collateralAsset,  // address of collateral token
    borrowedAsset,    // address of borrowed token
    collateralAmount, // amount of collateral in wei
    borrowedAmount    // amount borrowed in wei
);
```

Key Features:
- Prices are considered inactive after 1 hour
- Only owner can update prices
- Prices must be set in wei (18 decimals)
- Collateral ratio is returned as percentage (e.g., 150 = 150%)
- Reverts if borrowed amount is 0 or prices are inactive

## Setup

Install Node.js (i.e. v22.14.0)


1. Install Dependencies:
```bash
# Clear old dependencies
rm -rf node_modules

# Install JavaScript dependencies
npm install
```

2. Resolc binary for PVM compilation:
   - Download the latest resolc binary from [Revive releases](https://github.com/paritytech/revive/releases)
   - For macOS: Download `resolc-universal-apple-darwin`
   - For Linux: Download `resolc-x86_64-unknown-linux-musl`
   - For Windows: Download `resolc-x86_64-pc-windows-msvc.exe`
   - Place the binary in the `bin` folder and rename it to `resolc`
   - For macOS users: Run `xattr -c bin/resolc && chmod +x bin/resolc`

```bash
curl -L https://github.com/paritytech/revive/releases/download/v0.1.0-dev.16/resolc-universal-apple-darwin -o bin/resolc && xattr -c bin/resolc && chmod +x bin/resolc
```

3. Configure Environment:
Run `cp .env.example .env` and then modify the `.env` file with the following variables:
```
# Ethereum Network Configuration
SEPOLIA_URL=https://sepolia.infura.io/v3/PROJECT-ID
ETHERSCAN_API_KEY="etherscan-api-key"

# Cross-Chain Private Keys
# Using the same key allows consistent ownership across chains
PRIVATE_KEY=your-private-key
WESTEND_HUB_PK=your_westend_private_key  # Private key in hex format (with or without 0x prefix)
```

4. PolkaVM binaries should be in the `bin` directory from the documentation

5. Deploy Contracts:

```bash
# Clear all caches (optional - do this to force a fresh compilation)
rm -rf cache cache-pvm artifacts artifacts-pvm
```

```bash
# Solc binary
./scripts/download-solc.sh
```

```bash
# Setup compilers (make solc and resolc executable)
chmod +x scripts/setup-compilers.sh && ./scripts/setup-compilers.sh
```

```bash
# Compilation Process

## For Ethereum (EVM)
# Regular Hardhat compilation that handles imports automatically
# If you see "Nothing to compile", it means the contracts haven't changed
# Use the clear cache command above to force recompilation
npm run compile:evm

## For Westend Asset Hub (PVM)
# This is a two-step process:
# 1. Contracts are flattened (all imports combined into one file)
# 2. resolc compiles the flattened Solidity directly to PVM bytecode
#
# Note: resolc includes its own Solidity compiler and converts
# the output directly to PVM format. Flattening is only needed
# because resolc doesn't handle imports directly.
npx hardhat compile:pvm --contract PriceOracle  # Compile PriceOracle to PVM
npx hardhat compile:pvm --contract WrappedToken # Compile WrappedToken to PVM

# Generate TypeScript typings for contracts (after compilation)
npx hardhat typechain

# 1. Deploy core contracts to Ethereum (required)
npm run deploy:eth

# This will deploy:
# - LendingPool: Main lending functionality
# - LendingPoolBridge: Cross-chain bridge logic
# - PriceOracle (EVM version): Price feed management for Ethereum operations
#   Compiled with compile:evm, deployed as EVM bytecode
# - MockERC20: Test token for simulating bridgeable assets during development
#   This is just for testing, not part of the production bridge

# 2. Deploy supporting contracts to Westend Asset Hub
npm run deploy:westend

# This will deploy:
# - WrappedToken (deploy:wrapped-token): For cross-chain asset representation
#   This is the actual bridge token that represents Ethereum assets on Westend
#   Compiled to PVM for Westend compatibility
#   Address saved to deployments/wrapped-token.json
# - PriceOracle (PVM version): Price feed integration for Westend operations
#   Compiled with compile:pvm, deployed as PVM bytecode
#   Address saved to deployments/price-oracle.json

# 3. Verify contracts on block explorers

## Ethereum (Sepolia)
Contracts will be automatically verified on Etherscan if ETHERSCAN_API_KEY is set in .env
Verify deployment at:
- https://sepolia.etherscan.io/address/YOUR_CONTRACT_ADDRESS

## Westend
Contracts deployed to Westend can be verified on:
- https://westend.subscan.io/
- https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Fwestend-rpc.polkadot.io#/explorer
```

## Network Configuration

### Deployment Keys
The same private key is used to deploy to both networks, but it's represented with different address formats:
- Ethereum (Sepolia): `0x83De04f1aad8ABF1883166B14A29c084b7B8AB59` (EVM address format)
- Westend Asset Hub: `5CLjhrXUVwZ6TE5JtinC4Ke6Y5BWb1FNVneaVcKFdphcefSv` (Substrate SS58 address format)

### Sepolia (Ethereum Testnet)
- Chain ID: 11155111
- Currency Symbol: ETH
- Block Explorer: https://sepolia.etherscan.io

### Westend Asset Hub
- RPC URL: https://westend-asset-hub-eth-rpc.polkadot.io
- Chain ID: 420420421
- Currency Symbol: WND
- Block Explorer: https://blockscout-asset-hub.parity-chains-scw.parity.io


You can get test WND tokens from the [Westend Faucet](https://faucet.westend.network) or https://paritytech.github.io/polkadot-testnet-faucet/

## Contract Architecture

1. `LendingPool.sol` (Ethereum)
   - Manages deposits and collateral
   - Handles liquidations
   - Tracks lender and borrower positions


2. `LendingPoolBridge.sol` (Both networks)
   - Implements matching logic
   - Manages VTL ranges
   - Handles cross-chain communication


3. `WrappedToken.sol` (Westend Asset Hub)
   - ERC20 token for cross-chain asset representation
   - Deployed using PolkaVM for Westend compatibility


## Deployment

Only PriceOracle.sol and WrappedToken.sol should be deployed to Westend AssetHub (PolkaVM).

The rest of the contracts, including LendingPool.sol and LendingPoolBridge.sol, are deployed to Sepolia Ethereum or EVM-compatible networks.

## Development

### Testing
```bash
# Run contract tests on local Hardhat network
npm run test
```

Tests are run on a local Hardhat network, not on any testnet. This provides:
- Fast test execution
- Clean state for each test
- Ability to manipulate blockchain time
- Free test transactions

### Deployment Scripts

The project uses separate deployment scripts for each network:

1. Ethereum (Sepolia) Deployment:
```bash
npm run deploy:eth  # Deploys LendingPool, LendingPoolBridge, PriceOracle (EVM), MockERC20
```

2. Westend Asset Hub Deployment:
```bash
npm run deploy:wrapped-token  # Deploys WrappedToken
npm run deploy:price-oracle   # Deploys PriceOracle (PVM)
# Or deploy both with:
npm run deploy:westend
```

### Deployment Architecture

This project uses a unified deployment approach for both networks:

1. **Compilation**:
   - Ethereum (Sepolia): Standard Solidity compilation to EVM bytecode via Hardhat
   - Westend Asset Hub: Two-step process:
     1. Flatten Solidity contracts (combine imports)
     2. Compile to PVM bytecode using resolc

2. **Deployment**:
   Both networks use ethers.js for deployment, which means:
   - No need for Polkadot.js API or Substrate calls
   - Same deployment code works for both networks
   - Standard Ethereum-style transactions
   - Familiar tooling and debugging

3. **Contract Interaction**:
   - Both networks support standard Web3 interfaces
   - Use the same ABI format
   - Compatible with Ethereum tools and libraries

### Network Comparison

Ethereum (Sepolia):
- Uses standard EVM bytecode
- Higher gas costs but more established ecosystem
- Contracts: LendingPool, LendingPoolBridge, PriceOracle (EVM), MockERC20

Westend Asset Hub:
- Uses PVM (PolkaVM) bytecode
- Lower fees and faster finality
- Contracts: WrappedToken, PriceOracle (PVM)
- Fully EVM-compatible despite using PVM
- No need for Substrate-specific calls

### Contract Verification

#### Ethereum (Sepolia)
Contracts are automatically verified on Etherscan using the `@nomicfoundation/hardhat-toolbox` plugin.

#### Westend Asset Hub
Contracts need to be verified manually on Subscan. The deployment scripts will provide instructions, but here's the process:

1. After deployment, find the flattened contract source in `artifacts-pvm/`:
   - For WrappedToken: `artifacts-pvm/WrappedToken.flattened.sol`
   - For PriceOracle: `artifacts-pvm/PriceOracle.flattened.sol`

2. Go to [Subscan Contract Verification](https://westend.subscan.io/tools/verify_contract)

3. Fill in the verification details:
   - Contract Address: (from deployment output)
   - Contract Name: WrappedToken or PriceOracle
   - Compiler Version: v0.8.20
   - Optimization: Enabled, 200 runs
   - Source Code: Paste the content from the flattened file

4. Submit for verification

Note: The flattened source is automatically generated during compilation because resolc doesn't handle imports directly. The `compile:pvm` task:
1. Flattens the contract (combines all imports into one file)
2. Uses resolc to compile the flattened Solidity directly to PVM bytecode

This ensures the verified source code exactly matches what was deployed.

## License

MIT
