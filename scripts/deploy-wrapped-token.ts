import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
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
  const pvmBytecode = fs.readFileSync(pvmPath);

  // Get the contract factory with PVM bytecode
  const [deployer] = await ethers.getSigners();
  const factory = new ethers.ContractFactory(
    [], // ABI - empty since we're just deploying the bytecode
    "0x" + pvmBytecode.toString("hex"),
    deployer
  );
  
  // Deploy the contract
  const wrappedToken = await factory.deploy();
  await wrappedToken.waitForDeployment();

  const wrappedTokenAddress = await wrappedToken.getAddress();
  console.log("WrappedToken deployed to:", wrappedTokenAddress);

  // Save deployment info
  const deploymentsDir = path.join(__dirname, "../deployments");
  
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(deploymentsDir, "wrapped-token.json"),
    JSON.stringify({
      address: wrappedTokenAddress,
      network: "westendAssetHub",
      timestamp: new Date().toISOString()
    }, null, 2)
  );

  console.log("Deployment info saved to deployments/wrapped-token.json");

  // Prepare verification data for Subscan
  const flattenedSource = fs.readFileSync(path.join(process.cwd(), "artifacts-pvm", `WrappedToken.flattened.sol`), 'utf8');
  
  console.log("\nTo verify contract on Subscan:")
  console.log("1. Go to https://westend.subscan.io/tools/verify_contract")
  console.log(`2. Contract Address: ${wrappedTokenAddress}`)
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
