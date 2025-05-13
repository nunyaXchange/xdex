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

  // Get the contract factory with PVM bytecode and ABI
  const [deployer] = await ethers.getSigners();
  
  // Get the ABI from the original contract artifact
  const artifact = require('../artifacts/contracts/WrappedToken.sol/WrappedToken.json');
  
  // Create factory with PVM bytecode
  const factory = new ethers.ContractFactory(
    artifact.abi,
    pvmBytecode,  // Use raw PVM bytecode
    deployer
  );
  
  // Get account details
  const deployerAddress = await deployer.getAddress();
  console.log("Deployer address:", deployerAddress);
  
  const network = await deployer.provider.getNetwork();
  const symbol = network.chainId === 420420421n ? "WND" : "ETH";
  
  // Get balance for Westend Asset Hub using raw RPC call
  let balance;
  try {
    const result = await deployer.provider.send('eth_getBalance', [deployerAddress, 'latest']);
    balance = BigInt(result);
  } catch (e) {
    console.error('Failed to get balance:', e);
    balance = await deployer.provider.getBalance(deployerAddress);
  }
  console.log("Deployer balance:", ethers.formatEther(balance), symbol);

  const nonce = await deployer.provider.getTransactionCount(deployerAddress);
  console.log("Current nonce:", nonce);

  // Set gas parameters from hardhat config for Westend Asset Hub
  const gasPrice = 100000000000n;  // 100 gwei as per config
  const gasLimit = 5000000; // Use config gas limit
  
  // First check if we can estimate gas
  const gasEstimate = await deployer.provider.estimateGas({
    from: deployerAddress,
    data: factory.bytecode
  }).catch(e => {
    console.log('Gas estimation failed, using default:', e.message);
    return BigInt(5000000);
  });

  const tx = {
    nonce: nonce,
    data: factory.bytecode,
    gasPrice: gasPrice,
    gasLimit: gasLimit,
    value: 0,
    type: 0, // Legacy transaction type
    chainId: 420420421n // Explicit chainId
  };
  
  console.log("Gas price:", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  console.log("Gas limit:", gasLimit);
  console.log("Estimated cost:", ethers.formatEther(gasPrice * BigInt(gasLimit)), "WND");

  const maxRetries = 3;
  const maxTimeout = 180000; // 180 seconds timeout from config
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      // Add longer delay before transaction
      console.log(`Waiting 5 seconds before attempt ${attempt + 1}/${maxRetries}...`);
      await new Promise(resolve => setTimeout(resolve, 5000));

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
      
      // Increment nonce and add delay before retry
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay
      tx.nonce = await deployer.provider.getTransactionCount(deployerAddress, 'latest');
      console.log('Updated nonce to:', tx.nonce);
      console.log(`Increasing gas price to ${ethers.formatUnits(tx.gasPrice, 'gwei')} gwei`);
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
