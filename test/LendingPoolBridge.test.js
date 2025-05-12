const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LendingPoolBridge", function () {
  let LendingPoolBridge;
  let lendingPoolBridge;
  let owner;
  let lender;
  let borrower;
  let oracle;
  let wrappedToken;

  beforeEach(async function () {
    // Deploy mock ERC20 token for wrapped token
    const Token = await ethers.getContractFactory("MockERC20");
    wrappedToken = await Token.deploy("Wrapped Token", "WTKN");

    // Deploy LendingPoolBridge
    LendingPoolBridge = await ethers.getContractFactory("LendingPoolBridge");
    [owner, lender, borrower, oracle] = await ethers.getSigners();
    lendingPoolBridge = await LendingPoolBridge.deploy(
      oracle.address,
      ethers.ZeroAddress, // EVM contract address
      wrappedToken.address
    );

    // Mint wrapped tokens for testing
    await wrappedToken.mint(lendingPoolBridge.address, ethers.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await lendingPoolBridge.owner()).to.equal(owner.address);
    });

    it("Should set the right oracle", async function () {
      expect(await lendingPoolBridge.oracle()).to.equal(oracle.address);
    });
  });

  describe("VTL Range Operations", function () {
    it("Should create lender offer with valid VTL range", async function () {
      await lendingPoolBridge.connect(lender).createLenderOffer(
        ethers.parseEther("100"),
        130, // 1.3
        160  // 1.6
      );

      const offer = await lendingPoolBridge.lenderOffers(lender.address);
      expect(offer.amount).to.equal(ethers.parseEther("100"));
      expect(offer.vtlRange.lower).to.equal(130);
      expect(offer.vtlRange.upper).to.equal(160);
      expect(offer.isActive).to.equal(true);
    });
  });
});
