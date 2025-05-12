import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import type { ExtrinsicStatus } from '@polkadot/types/interfaces';
import type { DispatchError } from '@polkadot/types/interfaces';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { u8aToHex, hexToU8a } from '@polkadot/util';
import BN from 'bn.js';

dotenv.config();

// Helper function to ensure 32 byte array
function ensure32Bytes(input: number[] | Uint8Array): Uint8Array {
  const result = new Uint8Array(32);
  const source = input instanceof Uint8Array ? input : new Uint8Array(input);
  result.set(source.slice(0, 32));  // Copy up to 32 bytes
  // If input was shorter than 32 bytes, remaining bytes are left as 0
  return result;
}

async function deployContract(
  api: ApiPromise,
  account: any,
  contractName: string,
  constructorArgs: any[] = []
): Promise<string> {
  const artifactsPath = path.join(__dirname, '..', 'artifacts-pvm');
  const pvmPath = path.join(artifactsPath, `${contractName}.flattened.sol:${contractName}.pvm`);
  const metadataPath = path.join(artifactsPath, `${contractName}.flattened.sol:${contractName}.json`);

  if (!fs.existsSync(pvmPath)) {
    throw new Error(`PVM file not found at ${pvmPath}`);
  }
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`Metadata file not found at ${metadataPath}`);
  }

  const pvmCodeBuffer = fs.readFileSync(pvmPath);
  console.log('PVM code size:', pvmCodeBuffer.length, 'bytes');

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

  // Check account balance
  const accountInfo = await api.query.system.account(account.address);
  const balance = (accountInfo as any).data.free;
  console.log('Account balance:', balance.toString());

  // Get nonce for deployment
  const nonce = await api.rpc.system.accountNextIndex(account.address);
  console.log('Deployment tx nonce:', nonce.toString());

  // Log available pallets and queries for debugging
  console.log('Available pallets:', Object.keys(api.tx).join(', '));
  console.log('Available queries:', Object.keys(api.query).join(', '));

  // Get block weights and adjust parameters
  const blockWeights = await api.consts.system.blockWeights;
  const maxBlock = JSON.parse((blockWeights as any).maxBlock.toString());
  const maxExtrinsic = JSON.parse((blockWeights as any).perClass.normal.maxExtrinsic.toString());
  
  console.log('Block weight limits:', {
    maxBlock,
    maxExtrinsic
  });

  // Create deployment parameters
  const value = new BN('100000000000');  // 100 WND
  const gasLimit = {
    refTime: new BN(maxExtrinsic.refTime).divn(2),
    proofSize: new BN(maxExtrinsic.proofSize).divn(2)
  };
  const baseStorageDeposit = new BN('100000000000');
  const bytesMultiplier = new BN('1000000000');
  const codeSize = new BN(pvmCodeBuffer.length);
  const storageDepositLimit = baseStorageDeposit.add(
    codeSize.mul(bytesMultiplier)
  );

  console.log('Deployment parameters:');
  console.log('Value (endowment):', value.toString());
  console.log('Gas limit refTime:', gasLimit.refTime.toString());
  console.log('Gas limit proofSize:', gasLimit.proofSize.toString());
  console.log('Storage deposit limit:', storageDepositLimit.toString());
  console.log('Contract code size:', codeSize.toString(), 'bytes');

  const totalRequired = value.add(storageDepositLimit);
  console.log('Total required:', totalRequired.toString());
  
  if (balance.toBn().lt(totalRequired)) {
    throw new Error(`Insufficient balance. Have: ${balance.toString()}, Need: ${totalRequired.toString()}`);
  }

  // Prepare contract deployment parameters
  const code = api.createType('Bytes', [...pvmCodeBuffer]);
  const salt = api.createType('Bytes', Array(32).fill(0));
  const data = api.createType('Bytes', []);

  console.log('Using nonce:', nonce.toString());
  console.log('Salt length:', salt.length, 'bytes');

  // Deploy the contract
  console.log('Submitting instantiate transaction...');
  return new Promise<string>((resolve, reject) => {
    if (!api.tx.revive) {
      reject(new Error('Revive pallet not found. Available pallets: ' + Object.keys(api.tx).join(', ')));
      return;
    }

    api.tx.revive
      .instantiateWithCode(value, gasLimit, storageDepositLimit, code, data, salt)
      .signAndSend(account, { nonce }, handleDeploymentCallback(resolve, reject));
  });
}

function handleDeploymentCallback(resolve: (address: string) => void, reject: (error: Error) => void) {
  return ({ status, events = [], dispatchError }: any) => {
    console.log('Status:', status.type);

    events.forEach(({ event }: any) => {
      console.log('Event:', `${event.section}.${event.method}:`, event.data.toString());
    });

    if (status.isFinalized) {
      // Look for NewAccount event which contains the contract address
      const newAccountEvent = events.find(
        ({ event }: any) => 
          event.section === 'system' && 
          event.method === 'NewAccount'
      );

      if (!newAccountEvent) {
        reject(new Error('Contract address not found in events'));
        return;
      }

      const contractAddress = newAccountEvent.event.data[0].toString();
      console.log('Contract deployed at:', contractAddress);

      // Save deployment info
      const deploymentsDir = path.join(__dirname, '../deployments');
      if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
      }

      fs.writeFileSync(
        path.join(deploymentsDir, 'polkadot-contracts.json'),
        JSON.stringify(
          {
            priceOracle: contractAddress,
            network: 'westend-asset-hub',
            timestamp: new Date().toISOString()
          },
          null,
          2
        )
      );

      console.log('Deployment info saved to deployments/polkadot-contracts.json');
      resolve(contractAddress);
    }

    if (dispatchError) {
      if (dispatchError.isModule) {
        reject(new Error(`Deployment failed: ${dispatchError.asModule.toString()}`));
      } else {
        reject(new Error(`Deployment failed: ${dispatchError.toString()}`));
      }
    }
  };
}

async function main() {
  // Wait for crypto utils to be ready
  await cryptoWaitReady();

  // Create Keyring instance
  const keyring = new Keyring({ type: 'sr25519' });

  // Add deployer account
  const deployerKey = process.env.WESTEND_HUB_PK;
  if (!deployerKey) {
    throw new Error('WESTEND_HUB_PK not found in environment variables');
  }
  const deployer = keyring.addFromUri(deployerKey);
  console.log('Deployer address:', deployer.address);

  // Initialize connection to Polkadot node
  console.log('Connecting to Westend Asset Hub...');
  const wsProvider = new WsProvider('wss://westend-asset-hub-rpc.polkadot.io');
  const api = await ApiPromise.create({
    provider: wsProvider,
    types: {},
    rpc: {}
  });

  // Wait for API to be ready
  await api.isReady;
  console.log('Connected to Westend Asset Hub');
  
  try {
    // First compile PriceOracle to PVM
    console.log('Compiling PriceOracle to PVM...');
    await new Promise((resolve, reject) => {
      try {
        execSync('npx hardhat compile:pvm --contract PriceOracle', { stdio: 'inherit' });
        resolve(undefined);
      } catch (error) {
        reject(error);
      }
    });

    // Deploy PriceOracle
    console.log('Deploying PriceOracle...');
    const priceOracleAddress = await deployContract(api, deployer, 'PriceOracle');
    console.log('PriceOracle deployed at:', priceOracleAddress);

    console.log('Deployment info saved to deployments/polkadot-contracts.json');
  } catch (error) {
    console.error('Deployment failed:', error);
    throw error;
  } finally {
    await api.disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
