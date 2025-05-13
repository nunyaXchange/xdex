import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition";
import * as dotenv from "dotenv";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

// Task to compile Solidity to PVM using resolc binary
task("compile:pvm", "Compiles contracts to PVM using resolc")
  .addParam("contract", "The name of the contract to compile")
  .setAction(async (taskArgs, hre) => {
    // First compile with local solc
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
      // First flatten the contract
      console.log("Flattening contract...");
      const flattenedContents = await hre.run("flatten:get-flattened-sources", {
        files: [contractPath]
      });

      if (!flattenedContents) {
        throw new Error("Failed to flatten contract");
      }

      // Write flattened contract
      fs.writeFileSync(flattenedPath, flattenedContents);
      console.log("Contract flattened successfully");

      // Compile flattened contract with solc
      console.log("Compiling with solc...");
      const solcResult = spawnSync(solcPath, [
        flattenedPath,
        "--bin",
        "--abi",
        "--optimize",
        "--overwrite",
        "--metadata",
        "--metadata-literal"
      ]);

      if (solcResult.error) {
        throw solcResult.error;
      }

      // Check if solc compilation was successful
      if (solcResult.status !== 0) {
        throw new Error(`solc compilation failed: ${solcResult.stderr.toString()}`);
      }

      console.log("Contract compiled successfully with solc");

      // Now compile with resolc
      console.log("Compiling with resolc...");
      const binPath = path.join(process.cwd(), "bin");
      const env = {
        ...process.env,
        PATH: `${binPath}:${process.env.PATH}`
      };

      // Create standard JSON input for resolc
      const resolcInput = {
        language: "Solidity",
        sources: {
          [flattenedPath]: {
            content: fs.readFileSync(flattenedPath, 'utf8')
          }
        },
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          },
          outputSelection: {
            "*": {
              "*": ["evm.bytecode", "abi"]
            }
          }
        }
      };

      // Run resolc with JSON input through stdin
      const resolcResult = spawnSync(resolcPath, ["--standard-json"], { 
        input: JSON.stringify(resolcInput),
        env,
        encoding: 'utf-8'
      });

      if (resolcResult.error) {
        throw resolcResult.error;
      }

      // Check if resolc compilation was successful
      if (resolcResult.status !== 0) {
        throw new Error(`resolc compilation failed: ${resolcResult.stderr.toString()}`);
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
      chainId: 420420421
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
