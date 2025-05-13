import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

interface TaskArgs {
  contract: string;
}

dotenv.config();

// Task to compile Solidity to PVM using resolc binary
task("compile:pvm", "Compiles contracts to PVM using resolc")
  .addParam("contract", "The name of the contract to compile")
  .setAction(async (taskArgs: TaskArgs, hre) => {
    const solcPath = path.join(process.cwd(), "bin", "solc");
    const contractPath = path.join(process.cwd(), "contracts", `${taskArgs.contract}.sol`);
    const resolcPath = path.join(process.cwd(), "bin", "resolc");
    const pvmDir = path.join(process.cwd(), "artifacts-pvm");
    const flattenedPath = path.join(process.cwd(), "artifacts-pvm", `${taskArgs.contract}.flattened.sol`);

    // Clean and recreate PVM artifacts directory if it doesn't exist
    if (!fs.existsSync(pvmDir)) {
      fs.mkdirSync(pvmDir, { recursive: true });
    }

    try {
      // Compile with resolc directly
      console.log("Compiling with resolc...");
      
      // First flatten using hardhat's flattener
      const flattenedSource = await hre.run("flatten:get-flattened-sources", {
        files: [contractPath]
      });

      // Save flattened source
      const flattenedPath = path.join(pvmDir, `${taskArgs.contract}.flattened.sol`);
      fs.writeFileSync(flattenedPath, flattenedSource);

      // Then compile with resolc
      const solcPath = path.join(process.cwd(), "bin", "solc");
      const resolcResult = spawnSync(resolcPath, [
        contractPath,  // Use original contract path since resolc can handle imports
        '--base-path', process.cwd(),
        '--include-path', 'node_modules',
        '--include-path', 'node_modules/@openzeppelin',
        '--solc', solcPath,
        '-O3',  // Best performance optimization
        '--bin', // Output bytecode
        '--output-dir', pvmDir,
        '--overwrite'  // Allow overwriting existing files
      ], { 
        stdio: 'inherit',
        encoding: 'utf-8'
      });

      // The output will be named {ContractName}.sol:{ContractName}.pvm by resolc
      const outputPath = path.join(pvmDir, `${taskArgs.contract}.sol:${taskArgs.contract}.pvm`);
      const targetPath = path.join(pvmDir, `${taskArgs.contract}.flattened.sol:${taskArgs.contract}.pvm`);
      
      if (fs.existsSync(outputPath)) {
        fs.renameSync(outputPath, targetPath);
      } else {
        console.error('Expected PVM file not found:', outputPath);
        throw new Error('PVM compilation failed');
      }

      if (resolcResult.error) {
        throw resolcResult.error;
      }

      if (resolcResult.status !== 0) {
        throw new Error(`resolc failed with status ${resolcResult.status}`);
      }

      console.log("Contract compiled successfully with resolc");

    } catch (error) {
      console.error("Error during compilation:", error);
      process.exit(1);
    }
  });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    hardhat: {
      accounts: {
        accountsBalance: "100000000000000000000000" // 100,000 ETH
      }
    },
    westendAssetHub: {
      url: "https://westend-asset-hub-eth-rpc.polkadot.io",
      accounts: process.env.WESTEND_HUB_PK ? [process.env.WESTEND_HUB_PK] : [],
      chainId: 420420421,
      gasPrice: 100000000000,  // 100 gwei
      timeout: 180000,         // 180 seconds
      gas: 5000000,           // Higher fixed gas limit
      allowUnlimitedContractSize: true,
      blockGasLimit: 15000000  // Higher block gas limit
    },
    sepolia: {
      url: process.env.SEPOLIA_URL,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111
    }
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || ''
    }
  }
};

export default config;
