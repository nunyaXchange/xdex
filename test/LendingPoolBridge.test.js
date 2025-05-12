const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ZeroAddress } = ethers;

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
    await wrappedToken.waitForDeployment();

    // Deploy LendingPoolBridge
    LendingPoolBridge = await ethers.getContractFactory("LendingPoolBridge");
    [owner, lender, borrower, oracle] = await ethers.getSigners();
    lendingPoolBridge = await LendingPoolBridge.deploy(
      oracle.address,
      ZeroAddress, // EVM contract address
      await wrappedToken.getAddress()
    );
    await lendingPoolBridge.waitForDeployment();

    // Mint wrapped tokens for testing
    await wrappedToken.mint(await lendingPoolBridge.getAddress(), ethers.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await lendingPoolBridge.owner()).to.equal(owner.address);
    });

    it("Should set the right oracle", async function () {
      expect(await lendingPoolBridge.oracle()).to.equal(oracle.address);
    });

    it("Should set the right lending pool EVM contract address", async function () {
      expect(await lendingPoolBridge.lendingPoolEVMContractAddress()).to.equal(ZeroAddress);
    });
  });

  describe("VTL Range Operations", function () {
    it("Should create lender offer with valid VTL range", async function () {
      await expect(lendingPoolBridge.connect(lender).createLenderOffer(
        ethers.parseEther("100"),
        130, // 1.3
        160  // 1.6
      ))
        .to.emit(lendingPoolBridge, "LenderOfferCreated")
        .withArgs(lender.address, ethers.parseEther("100"), 130, 160);

      const offer = await lendingPoolBridge.lenderOffers(lender.address);
      expect(offer.amount).to.equal(ethers.parseEther("100"));
      expect(offer.vtlRange.lower).to.equal(130);
      expect(offer.vtlRange.upper).to.equal(160);
      expect(offer.isActive).to.equal(true);
    });

    it("Should create borrower request with valid VTL range", async function () {
      await expect(lendingPoolBridge.connect(borrower).createBorrowerRequest(
        ethers.parseEther("100"), // collateral
        ethers.parseEther("50"),  // requested
        140, // 1.4
        180  // 1.8
      ))
        .to.emit(lendingPoolBridge, "BorrowerRequestCreated")
        .withArgs(borrower.address, ethers.parseEther("100"), ethers.parseEther("50"), 140, 180);

      const request = await lendingPoolBridge.borrowerRequests(borrower.address);
      expect(request.collateralAmount).to.equal(ethers.parseEther("100"));
      expect(request.requestedAmount).to.equal(ethers.parseEther("50"));
      expect(request.vtlRange.lower).to.equal(140);
      expect(request.vtlRange.upper).to.equal(180);
      expect(request.isActive).to.equal(true);
    });
  });

  describe("Proof Verification", function () {
    // Note: In production, proof verification is handled by the Rust backend
    // which validates cross-chain asset ownership. For testing purposes,
    // we use empty proofs since the actual verification logic has been removed.
    it("Should verify lender proof and generate wrapped tokens", async function () {
      await lendingPoolBridge.connect(lender).createLenderOffer(
        ethers.parseEther("100"),
        130,
        160
      );

      await expect(lendingPoolBridge.verifyProof(
        lender.address,
        true, // isLender
        ethers.parseEther("100"),
        "0x" // Mock proof - in production this would be a cryptographic proof of asset ownership
      ))
        .to.emit(lendingPoolBridge, "LenderProofVerified")
        .withArgs(lender.address, ethers.parseEther("100"))
        .to.emit(lendingPoolBridge, "LenderWrappedTokensGenerated")
        .withArgs(lender.address, ethers.parseEther("100"));

      const offer = await lendingPoolBridge.lenderOffers(lender.address);
      expect(offer.proofVerified).to.equal(true);
      expect(offer.wrappedTokenBalance).to.equal(ethers.parseEther("100"));
    });

    it("Should verify borrower proof and generate wrapped tokens", async function () {
      await lendingPoolBridge.connect(borrower).createBorrowerRequest(
        ethers.parseEther("100"),
        ethers.parseEther("50"),
        140,
        180
      );

      await expect(lendingPoolBridge.verifyProof(
        borrower.address,
        false, // isLender
        ethers.parseEther("100"),
        "0x" // Mock proof - in production this would be a cryptographic proof of collateral ownership
      ))
        .to.emit(lendingPoolBridge, "BorrowerProofVerified")
        .withArgs(borrower.address, ethers.parseEther("100"))
        .to.emit(lendingPoolBridge, "BorrowerWrappedTokensGenerated")
        .withArgs(borrower.address, ethers.parseEther("100"));

      const request = await lendingPoolBridge.borrowerRequests(borrower.address);
      expect(request.proofVerified).to.equal(true);
      expect(request.wrappedCollateralBalance).to.equal(ethers.parseEther("100"));
    });
  });

  describe("Matching and Liquidation", function () {
    beforeEach(async function () {
      // Setup lender
      await lendingPoolBridge.connect(lender).createLenderOffer(
        ethers.parseEther("100"),
        130,
        160
      );
      await lendingPoolBridge.verifyProof(
        lender.address,
        true,
        ethers.parseEther("100"),
        "0x" // Mock proof for testing
      );

      // Setup borrower
      await lendingPoolBridge.connect(borrower).createBorrowerRequest(
        ethers.parseEther("100"),
        ethers.parseEther("50"),
        140,
        180
      );
      await lendingPoolBridge.verifyProof(
        borrower.address,
        false,
        ethers.parseEther("100"),
        "0x" // Mock proof for testing
      );
    });

    it("Should match lender and borrower with overlapping VTL", async function () {
      await expect(lendingPoolBridge.findMatch(lender.address, borrower.address))
        .to.emit(lendingPoolBridge, "MatchFound")
        .withArgs(lender.address, borrower.address, ethers.parseEther("50"));

      const liquidityPool = await lendingPoolBridge.liquidityPool(lender.address);
      expect(liquidityPool).to.equal(ethers.parseEther("50")); // matched amount
    });

    it("Should trigger liquidation when collateral ratio is too low", async function () {
      await expect(lendingPoolBridge.connect(oracle).updateCollateralRatio(
        borrower.address,
        120 // 1.2 - below threshold
      ))
        .to.emit(lendingPoolBridge, "BorrowerCollateralRatioUpdated")
        .withArgs(borrower.address, 120);

      const request = await lendingPoolBridge.borrowerRequests(borrower.address);
      expect(request.isActive).to.equal(false); // Position should be liquidated
    });
  });
});
