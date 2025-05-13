import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

async function main() {
  console.log("Compiling PriceOracle to PVM...");
  
  // First compile to PVM
  await new Promise((resolve, reject) => {
    try {
      execSync("npx hardhat compile:pvm --contract PriceOracle", { stdio: 'inherit' });
      resolve(undefined);
    } catch (error) {
      reject(error);
    }
  });

  console.log("Deploying PriceOracle to Westend Asset Hub...");

  // Get the PVM bytecode
  const pvmPath = path.join(__dirname, "../artifacts-pvm/PriceOracle.flattened.sol:PriceOracle.pvm");
  const pvmBytecode = fs.readFileSync(pvmPath);

  // Get the contract factory with PVM bytecode
  const [deployer] = await ethers.getSigners();
  const factory = new ethers.ContractFactory(
    [], // ABI - empty since we're just deploying the bytecode
    "0x" + pvmBytecode.toString("hex"),
    deployer
  );

  // Deploy the contract
  const contract = await factory.deploy();
  const tx = await contract.deploymentTransaction();
  if (tx) await tx.wait();

  const contractAddress = await contract.getAddress();
  console.log("PriceOracle deployed to:", contractAddress);

  // Save deployment info
  const deploymentPath = path.join(__dirname, "../deployments/price-oracle.json");
  fs.writeFileSync(
    deploymentPath,
    JSON.stringify(
      {
        priceOracle: contractAddress,
        network: "westendAssetHub",
        timestamp: new Date().toISOString()
      },
      null,
      2
    )
  );

  console.log("Deployment info saved to deployments/price-oracle.json");

  // Prepare verification data for Subscan
  const flattenedSource = fs.readFileSync(path.join(process.cwd(), "artifacts-pvm", `PriceOracle.flattened.sol`), 'utf8');
  
  console.log("\nTo verify contract on Subscan:")
  console.log("1. Go to https://westend.subscan.io/tools/verify_contract")
  console.log(`2. Contract Address: ${contractAddress}`)
  console.log(`3. Contract Name: PriceOracle`)
  console.log(`4. Compiler Version: v0.8.20`)
  console.log(`5. Optimization: Enabled, 200 runs`)
  console.log(`6. Paste the flattened source code from: artifacts-pvm/PriceOracle.flattened.sol`)
  console.log("7. Submit for verification")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
