# Sample Polkadot Hardhat Project for EthLisbon

This project demonstrates how to use Hardhat with Polkadot. It comes with a few sample contracts, Hardhat Ignition modules that deploy the contract and binaries needed for local deployment.

1) All binaries are in the `binaries` folder. Be sure to update the path of the binaries in the `hardhat.config.ts` file.

2) Time is returned in milliseconds in Polkadot. See the ignition module `Lock.ts`.

3) Commands to start a fresh project:

```bash
mkdir hardhat-example
cd hardhat-example
npm init -y
npm install -D @parity/hardhat-polkadot
npx hardhat-polkadot init
```

Then configure the hardhat config as per documentation (linked below).


4) Commands to run the project:

```bash
git clone git@github.com:UtkarshBhardwaj007/hardhat-polkadot-example.git
npm install
npx hardhat compile
npx hardhat ignition deploy ./ignition/modules/MyToken.ts --network westendAssetHub
```

1) Resources:
- [Polkadot Smart Contracts Documentation](https://papermoonio.github.io/polkadot-mkdocs/develop/smart-contracts/)
- [Polkadot Smart Contracts Tutorial](https://papermoonio.github.io/polkadot-mkdocs/tutorials/smart-contracts/)
- [Polkadot Smart Contract Basics](https://papermoonio.github.io/polkadot-mkdocs/polkadot-protocol/smart-contract-basics/)
- [Hardhat-Polkadot Plugin](https://github.com/paritytech/hardhat-polkadot/tree/main/packages/hardhat-polkadot)
- [SubScan Block Explorer for Asset Hub Westend](https://assethub-westend.subscan.io/)
- [Remix for Polkadot](https://remix.polkadot.io/)
- [Old Smart Contract Docs](https://contracts.polkadot.io/)

1) Support Channels:
- [Discord](https://discord.gg/polkadot)
- [Stack Exchange](https://substrate.meta.stackexchange.com/)
- [Telegram](https://t.me/substratedevs)
- [Reddit](https://www.reddit.com/r/Polkadot/)
