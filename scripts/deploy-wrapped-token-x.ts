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

  // Create deployment parameters with higher limits
  const value = new BN('10000000000000').toString();  // 10 WND for endowment
  
  // Increase gas limits while staying within block limits
  const gasLimit = {
    refTime: new BN('1000000000').toString(),    // 1B units
    proofSize: new BN('1000000').toString()      // 1M units
  };

  // Set explicit storage deposit limit
  const storageDepositLimit = new BN('100000000000000').toString();  // 100 WND for storage deposit

  console.log('Deployment parameters:');
  console.log('Value (endowment):', value);
  console.log('Gas limit refTime:', gasLimit.refTime);
  console.log('Gas limit proofSize:', gasLimit.proofSize);
  console.log('Storage deposit limit: null (chain calculated)');
  console.log('Contract code size:', pvmCodeBuffer.length, 'bytes');
  
  const totalRequired = new BN(value);
  console.log('Total required (excluding storage deposit):', totalRequired.toString());
  
  if (balance.toBn().lt(totalRequired)) {
    throw new Error(`Insufficient balance. Have: ${balance.toString()}, Need: ${totalRequired.toString()}`);
  }

  // Prepare contract deployment parameters
  // Properly encode the contract code
  const code = api.createType('Bytes', pvmCodeBuffer);
  
  // Create a fixed 32-byte salt
  const saltBytes = ensure32Bytes(randomBytes(32));
  const salt = u8aToHex(saltBytes);
  
  // Empty constructor arguments
  const encodedArgs = api.createType('Bytes', '0x');
  
  // Verify code encoding
  console.log('Code verification:');
  console.log('- Raw code (hex):', '0x' + pvmCodeBuffer.toString('hex').slice(0, 64) + '...');
  console.log('- Encoded code (hex):', code.toHex().slice(0, 64) + '...');
  
  // Log code size details
  console.log('Raw code size:', pvmCodeBuffer.length, 'bytes');
  console.log('Encoded code size:', code.length, 'bytes');
  console.log('Salt size:', salt.length, 'bytes');
  console.log('Args size:', encodedArgs.length, 'bytes');
  
  // Log parameters for debugging
  console.log('Code length:', pvmCodeBuffer.length);
  console.log('Salt:', u8aToHex(saltBytes));
  console.log('Encoded args:', u8aToHex(encodedArgs));

  console.log('Using nonce:', nonce.toString());
  console.log('Salt length:', salt.length, 'bytes');

  // Deploy the contract
  console.log('Submitting instantiate transaction...');
  return new Promise<string>((resolve, reject) => {
    if (!api.tx.revive) {
      reject(new Error('Revive pallet not found. Available pallets: ' + Object.keys(api.tx).join(', ')));
      return;
    }

    // Create transaction with null storage deposit limit
    const tx = api.tx.revive.instantiateWithCode(
      value,
      gasLimit,
      null,  // Let chain calculate storage deposit
      code,
      encodedArgs,
      salt
    );

    // Log parameters for debugging
    console.log('Transaction details:');
    console.log('- Value:', value);
    console.log('- Gas limit:', JSON.stringify(gasLimit, null, 2));
    console.log('- Code size:', code.length);
    console.log('- Encoded call data:', tx.method.toHex());

    // Sign and send
    tx.signAndSend(account, { nonce }, handleDeploymentCallback(resolve, reject));
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
        path.join(deploymentsDir, 'wrapped-token-x.json'),
        JSON.stringify(
          {
            priceOracle: contractAddress,
            network: 'westendAssetHub',
            timestamp: new Date().toISOString()
          },
          null,
          2
        )
      );

      console.log('Deployment info saved to deployments/wrapped-token-x.json');
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
  
  // Add custom RPC definitions for revive pallet
  const rpc = {
    revive: {
      instantiateWithCode: {
        description: 'Instantiate a new contract with code',
        params: [
          { name: 'value', type: 'Balance' },
          { name: 'gasLimit', type: 'WeightV2' },
          { name: 'storageDepositLimit', type: 'Option<Balance>' },
          { name: 'code', type: 'Bytes' },
          { name: 'data', type: 'Bytes' },
          { name: 'salt', type: 'Bytes' }
        ],
        type: 'ContractInstantiateResult'
      }
    }
  };
  const api = await ApiPromise.create({
    provider: wsProvider,
    types: {
      Weight: {
        refTime: 'Compact<u64>',
        proofSize: 'Compact<u64>'
      },
      WeightV2: {
        refTime: 'Compact<u64>',
        proofSize: 'Compact<u64>'
      }
    },
    rpc
  });

  // Wait for API to be ready
  await api.isReady;
  console.log('Connected to Westend Asset Hub');
  
  try {
    // First compile WrappedToken to PVM
    console.log('Compiling WrappedToken to PVM...');
    await new Promise((resolve, reject) => {
      try {
        execSync('npx hardhat compile:pvm --contract WrappedToken', { stdio: 'inherit' });
        resolve(undefined);
      } catch (error) {
        reject(error);
      }
    });

    // Deploy WrappedToken
    console.log('Deploying WrappedToken...');
    const wrappedTokenAddress = await deployContract(api, deployer, 'WrappedToken');
    console.log('WrappedToken deployed at:', wrappedTokenAddress);

    console.log('Deployment info saved to deployments/wrapped-token-x.json');
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
