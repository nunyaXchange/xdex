import { ethers } from "hardhat";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { constants } from "fs";
import { execSync } from "child_process";

async function main() {
  console.log("Compiling WrappedToken to PVM...");
  
  // First compile to PVM
  await new Promise((resolve, reject) => {
    try {
      execSync("npx hardhat compile:pvm --contract WrappedToken", { stdio: 'inherit' });
      resolve(undefined);
    } catch (error) {
      reject(error);
    }
  });

  console.log("Deploying WrappedToken to Westend Asset Hub...");

  // Get the PVM bytecode
  const pvmPath = path.join(__dirname, "../artifacts-pvm/WrappedToken.flattened.sol:WrappedToken.pvm");
  const pvmBytecodeRaw = fsSync.readFileSync(pvmPath);
  const pvmBytecode = '0x' + pvmBytecodeRaw.toString('hex');

  // Setup custom provider with the right configuration
  const westendProvider = new ethers.JsonRpcProvider(
    "https://westend-asset-hub-eth-rpc.polkadot.io",
    {
      chainId: 420420421,
      name: "westendAssetHub"
    }
  );
  
  // Create signer with the custom provider
  const deployer = new ethers.Wallet(process.env.WESTEND_HUB_PK || '', westendProvider);
  
  // Get the ABI from the original contract artifact
  const artifact = require('../artifacts/contracts/WrappedToken.sol/WrappedToken.json');
  
  // Get account details
  const deployerAddress = await deployer.getAddress();
  console.log("Deployer address:", deployerAddress);
  
  const network = await westendProvider.getNetwork();
  const symbol = network.chainId === 420420421n ? "WND" : "ETH";
  
  // Get balance with retries
  const balanceMaxRetries = 3;
  let balance = 0n;
  let balanceAttempt = 0;
  
  while (balanceAttempt < balanceMaxRetries && balance === 0n) {
    if (balanceAttempt > 0) {
      // Wait 2 seconds between retries
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    try {
      const rpcResult = await westendProvider.send('eth_getBalance', [deployerAddress, 'latest']);
      balance = BigInt(rpcResult);
    } catch (e) {
      console.error('RPC balance check failed, retrying...');
    }
    
    balanceAttempt++;
  }

  console.log("Deployer balance:", ethers.formatEther(balance), symbol);

  if (balance === 0n) {
    throw new Error(`No ${symbol} balance found. Please ensure the account is funded.`);
  }

  // Function to get a fresh nonce
  async function getFreshNonce() {
    // Wait for any pending transactions
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Get nonces from multiple blocks to ensure freshness
    const [latestNonce, pendingNonce] = await Promise.all([
      westendProvider.getTransactionCount(deployerAddress, 'latest'),
      westendProvider.getTransactionCount(deployerAddress, 'pending')
    ]);
    
    // Get the block number to verify chain progress
    const blockNumber = await westendProvider.getBlockNumber();
    console.log(`Current block: ${blockNumber}, Latest nonce: ${latestNonce}, Pending nonce: ${pendingNonce}`);
    
    // Use highest nonce and add 1 to ensure freshness
    return Math.max(latestNonce, pendingNonce);
  }

  // Get fresh nonce
  const nonce = await getFreshNonce();
  console.log("Using nonce:", nonce);

  // Set gas parameters from hardhat config for Westend Asset Hub
  const gasPrice = 10000000000n;  // 10 gwei
  const gasLimit = 10000000; // Reduced gas limit
  
  // First check if we can estimate gas
  const gasEstimate = await westendProvider.estimateGas({
    from: deployerAddress,
    data: pvmBytecode
  }).catch(e => {
    console.log('Gas estimation failed, using default:', e.message);
    return BigInt(5000000);
  });

  const tx = {
    nonce: nonce,
    data: pvmBytecode,
    gasPrice: gasPrice,
    gasLimit: gasLimit,
    value: 0,
    type: 2, // EIP-1559 transaction type
    chainId: 420420421n // Explicit chainId
  };

  // Wait for chain to progress before sending transaction
  const currentBlock = await westendProvider.getBlockNumber();
  console.log(`Waiting for new block. Current block: ${currentBlock}`);
  
  let newBlock = currentBlock;
  while (newBlock <= currentBlock) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    newBlock = await westendProvider.getBlockNumber();
  }
  
  console.log(`Chain progressed to block ${newBlock}. Proceeding with deployment...`);
  
  console.log("Gas price:", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  console.log("Gas limit:", gasLimit);
  console.log("Estimated cost:", ethers.formatEther(gasPrice * BigInt(gasLimit)), "WND");

  const maxRetries = 3;
  const maxTimeout = 180000; // 180 seconds timeout from config
  let attempt = 0;

  // Initial delay before first attempt with random jitter
  const initialDelay = 30000 + Math.floor(Math.random() * 5000);
  console.log(`Waiting ${Math.round(initialDelay/1000)} seconds before first attempt...`);
  await new Promise(resolve => setTimeout(resolve, initialDelay));

  while (attempt < maxRetries) {
    try {
      console.log("Deploying with transaction:", {
        ...tx,
        data: tx.data.substring(0, 100) + '...' // Truncate data for logging
      });

      // Send the transaction
      const deployTransaction = await deployer.sendTransaction(tx);
      console.log("Transaction hash:", deployTransaction.hash);

      // Wait for deployment to complete
      const receipt = await deployTransaction.wait();
      if (!receipt?.contractAddress) {
        throw new Error("Contract deployment failed - no contract address");
      }
      
      console.log("Contract deployed successfully!");
      console.log("Contract address:", receipt.contractAddress);
      console.log("View on Blockscout:", `https://blockscout-asset-hub.parity-chains-scw.parity.io/address/${receipt.contractAddress}?tab=contract`);
      
      // Save deployment info
      const deploymentInfo = {
        address: receipt.contractAddress,
        network: network.name,
        chainId: network.chainId.toString()
      };
      
      // Ensure deployments directory exists
      const deploymentsDir = path.join(__dirname, '../deployments');
      try {
        await fs.access(deploymentsDir, constants.F_OK);
      } catch {
        await fs.mkdir(deploymentsDir, { recursive: true });
      }
      
      // Write deployment info
      await fs.writeFile(
        path.join(deploymentsDir, 'wrapped-token.json'),
        JSON.stringify(deploymentInfo, null, 2),
        { encoding: 'utf8' }
      );

      return receipt.contractAddress; // Success, return the address
    } catch (error) {
      attempt++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`Attempt ${attempt}/${maxRetries} failed: ${errorMessage}`);

      // Check if we got a contract address even though it failed
      // Check for contract address in error response
      const errorObj = error as { receipt?: { contractAddress?: string } };
      if (errorObj?.receipt?.contractAddress) {
        console.log("Contract address from failed tx:", errorObj.receipt.contractAddress);
        console.log("View on Blockscout:", `https://blockscout-asset-hub.parity-chains-scw.parity.io/address/${errorObj.receipt.contractAddress}?tab=contract`);
      }

      if (attempt === maxRetries) {
        throw new Error(`Failed to deploy after ${maxRetries} attempts: ${errorMessage}`);
      }
      
      // Add delay with jitter before retry
      const retryDelay = 30000 + Math.floor(Math.random() * 5000);
      console.log(`Waiting ${Math.round(retryDelay/1000)} seconds before next attempt ${attempt + 1}/${maxRetries}...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      
      // Get completely fresh nonce for retry
      tx.nonce = await getFreshNonce();
      console.log('Updated to fresh nonce:', tx.nonce);
      
      // Wait for chain to progress
      const retryCurrentBlock = await westendProvider.getBlockNumber();
      console.log(`Waiting for new block before retry. Current block: ${retryCurrentBlock}`);
      
      let retryNewBlock = retryCurrentBlock;
      while (retryNewBlock <= retryCurrentBlock) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        retryNewBlock = await westendProvider.getBlockNumber();
      }
      
      console.log(`Chain progressed to block ${retryNewBlock}. Proceeding with retry...`);
      console.log(`Gas price: ${ethers.formatUnits(tx.gasPrice, 'gwei')} gwei`);
      console.log(`New gas limit: ${tx.gasLimit}`);
      console.log(`Estimated cost: ${ethers.formatEther(tx.gasPrice * BigInt(tx.gasLimit))} WND`);
    }
  }

  // Prepare verification data for Subscan
  const flattenedSource = fsSync.readFileSync(path.join(process.cwd(), "artifacts-pvm", `WrappedToken.flattened.sol`), 'utf8');
  
  console.log("\nTo verify contract on Subscan:")
  console.log("1. Go to https://westend.subscan.io/tools/verify_contract")
  console.log(`2. Contract Address: <Contract address will be shown after successful deployment>`)
  console.log(`3. Contract Name: WrappedToken`)
  console.log(`4. Compiler Version: v0.8.20`)
  console.log(`5. Optimization: Enabled, 200 runs`)
  console.log(`6. Paste the flattened source code from: artifacts-pvm/WrappedToken.flattened.sol`)
  console.log("7. Submit for verification")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
