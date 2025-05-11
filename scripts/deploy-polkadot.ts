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

  return new Promise(async (resolve, reject) => {
    try {
      // Wait for the API to be ready
      await api.isReady;

      // Check if revive module is available
      if (!api.tx.revive) {
        throw new Error('Revive module not available on this chain');
      }

      // Get account info and balance
      const accountInfo = await api.query.system.account(account.address);
      const balance = (accountInfo as any).data.free;
      console.log('Account balance:', balance.toString());

      // Map the account first
      console.log('Mapping account...');
      const mapAccountTx = api.tx.revive.mapAccount();
      
      // Get nonce for mapping transaction
      let nonce = await api.rpc.system.accountNextIndex(account.address);
      console.log('Mapping tx nonce:', nonce.toString());
      
      const mapHash = await mapAccountTx.signAndSend(account, { nonce });
      console.log('Account mapping tx hash:', mapHash.toString());

      // Wait for the mapping to be included in a block
      await new Promise(resolve => setTimeout(resolve, 12000)); // Wait 12s for block inclusion

      // Get fresh nonce for deployment transaction
      nonce = await api.rpc.system.accountNextIndex(account.address);
      console.log('Deployment tx nonce:', nonce.toString());

      // Get block weights and adjust our parameters
      const blockWeights = await api.consts.system.blockWeights;
      const maxBlock = JSON.parse((blockWeights as any).maxBlock.toString());
      const maxExtrinsic = JSON.parse((blockWeights as any).perClass.normal.maxExtrinsic.toString());
      
      console.log('Block weight limits:', {
        maxBlock,
        maxExtrinsic
      });

      // Create the value parameter (endowment) with BN
      const value = new BN('100000000000');  // 100 WND

      // Create the gas limit parameter with BN - based on block limits
      const gasLimit = {
        refTime: new BN(maxExtrinsic.refTime).divn(2),  // Use half of max extrinsic weight
        proofSize: new BN(maxExtrinsic.proofSize).divn(2) // Use half of max proof size
      };

      // Calculate storage deposit based on code size with larger multiplier
      const baseStorageDeposit = new BN('100000000000');  // 100 WND base deposit
      const bytesMultiplier = new BN('1000000000');       // 1 WND per byte
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

      // Check if balance is sufficient for deployment
      const totalRequired = value.add(storageDepositLimit);
      console.log('Total required:', totalRequired.toString());
      
      if (balance.toBn().lt(totalRequired)) {
        throw new Error(`Insufficient balance. Have: ${balance.toString()}, Need: ${totalRequired.toString()}`);
      }

      // Create the code parameter using Buffer
      const code = api.createType('Bytes', [...pvmCodeBuffer]);

      // Create a fixed 32-byte salt
      const salt = api.createType('Bytes', Array(32).fill(0));  // 32 zero bytes

      // Empty constructor data since we don't need any arguments
      const data = api.createType('Bytes', []);

      console.log('Using nonce:', nonce.toString());
      console.log('Salt length:', salt.length, 'bytes');

      console.log('Submitting instantiate transaction...');
      api.tx.revive
        .instantiateWithCode(value, gasLimit, storageDepositLimit, code, data, salt)
        .signAndSend(account, { nonce }, ({ events = [], status }) => {
          console.log('Status:', status.type);
          
          if (status.isInBlock || status.isFinalized) {
            events.forEach(({ event }) => {
              const { section, method, data } = event;
              console.log(`Event: ${section}.${method}:`, data.toString());
              
              if (section === 'system' && method === 'ExtrinsicFailed') {
                const [dispatchError] = data as unknown as [DispatchError];
                let errorInfo;
                
                if (dispatchError.isModule) {
                  const decoded = api.registry.findMetaError(dispatchError.asModule);
                  errorInfo = `${decoded.section}.${decoded.name}: ${decoded.docs}`;
                } else {
                  errorInfo = dispatchError.toString();
                }
                
                reject(new Error(`Deployment failed: ${errorInfo}`));
              }
            });

            if (status.isFinalized) {
              const instantiateEvent = events.find(({ event }) => 
                event.section === 'revive' && event.method === 'Instantiated'
              );

              if (instantiateEvent) {
                const [deployer, contractAddress] = instantiateEvent.event.data;
                console.log('Contract instantiated by:', deployer.toString());
                console.log('Contract address:', contractAddress.toString());
                resolve(contractAddress.toString());
              } else {
                reject(new Error('Contract instantiation event not found'));
              }
            }
          }
        })
        .catch(reject);
    } catch (error) {
      reject(error);
    }
  });
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

    // Save deployment info
    const deploymentsDir = path.join(__dirname, '../deployments');
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(deploymentsDir, 'polkadot-contracts.json'),
      JSON.stringify(
        {
          priceOracle: priceOracleAddress,
          network: 'westend-asset-hub',
          timestamp: new Date().toISOString()
        },
        null,
        2
      )
    );

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
