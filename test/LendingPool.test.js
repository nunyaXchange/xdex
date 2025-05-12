const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LendingPool", function () {
  let LendingPool;
  let lendingPool;
  let owner;
  let lender;
  let borrower;
  let polkaVMBridge;
  let token;

  beforeEach(async function () {
    // Deploy mock ERC20 token
    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy("Mock Token", "MTK");
    await token.waitForDeployment();
    
    // Deploy LendingPool
    LendingPool = await ethers.getContractFactory("LendingPool");
    [owner, lender, borrower, polkaVMBridge] = await ethers.getSigners();
    lendingPool = await LendingPool.deploy(await token.getAddress());
    await lendingPool.waitForDeployment();

    // Set PolkaVM bridge address
    await lendingPool.setPolkaVMBridge(await polkaVMBridge.getAddress());

    // Mint tokens for testing
    await token.mint(lender.address, ethers.parseEther("1000"));
    await token.mint(borrower.address, ethers.parseEther("1000"));

    // Approve LendingPool to spend tokens
    await token.connect(lender).approve(await lendingPool.getAddress(), ethers.parseEther("1000"));
    await token.connect(borrower).approve(await lendingPool.getAddress(), ethers.parseEther("1000"));
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await lendingPool.owner()).to.equal(await owner.getAddress());
    });

    it("Should set the right PolkaVM bridge", async function () {
      expect(await lendingPool.polkaVMBridge()).to.equal(await polkaVMBridge.getAddress());
    });

    it("Should set the right token", async function () {
      expect(await lendingPool.token()).to.equal(await token.getAddress());
    });
  });

  describe("Lender Operations", function () {
    it("Should allow lender to deposit assets", async function () {
      const amount = ethers.parseEther("100");
      await expect(lendingPool.connect(lender).depositLenderAssets(amount))
        .to.emit(lendingPool, "LenderDeposit")
        .withArgs(await lender.getAddress(), amount);
      const position = await lendingPool.lenderPositions(await lender.getAddress());
      expect(position.amount).to.equal(amount);
      expect(position.isLocked).to.equal(false);
    });

    it("Should not allow deposit when position is locked", async function () {
      const amount = ethers.parseEther("100");
      await lendingPool.connect(lender).depositLenderAssets(amount);
      await expect(lendingPool.connect(polkaVMBridge).lockLenderPosition(await lender.getAddress()))
        .to.emit(lendingPool, "LenderPositionLocked")
        .withArgs(await lender.getAddress());
      
      await expect(
        lendingPool.connect(lender).depositLenderAssets(amount)
      ).to.be.revertedWith("Position is locked");
    });
  });

  describe("Borrower Operations", function () {
    it("Should allow borrower to deposit collateral", async function () {
      const amount = ethers.parseEther("100");
      await expect(lendingPool.connect(borrower).depositCollateral(amount))
        .to.emit(lendingPool, "BorrowerCollateralDeposit")
        .withArgs(await borrower.getAddress(), amount);
      const position = await lendingPool.borrowerPositions(await borrower.getAddress());
      expect(position.collateralAmount).to.equal(amount);
      expect(position.isLocked).to.equal(false);
    });

    it("Should not allow deposit when position is locked", async function () {
      const amount = ethers.parseEther("100");
      await lendingPool.connect(borrower).depositCollateral(amount);
      await expect(lendingPool.connect(polkaVMBridge).lockBorrowerPosition(await borrower.getAddress()))
        .to.emit(lendingPool, "BorrowerPositionLocked")
        .withArgs(await borrower.getAddress());
      
      await expect(
        lendingPool.connect(borrower).depositCollateral(amount)
      ).to.be.revertedWith("Position is locked");
    });
  });

  describe("PolkaVM Bridge Operations", function () {
    it("Should allow bridge to execute borrow", async function () {
      const lendAmount = ethers.parseEther("100");
      const borrowAmount = ethers.parseEther("50");

      await lendingPool.connect(lender).depositLenderAssets(lendAmount);
      await lendingPool.connect(polkaVMBridge).lockLenderPosition(await lender.getAddress());
      await lendingPool.connect(borrower).depositCollateral(lendAmount);
      await lendingPool.connect(polkaVMBridge).lockBorrowerPosition(await borrower.getAddress());

      await expect(lendingPool.connect(polkaVMBridge).executeBorrow(
        await borrower.getAddress(),
        await lender.getAddress(),
        borrowAmount
      ))
        .to.emit(lendingPool, "BorrowExecuted")
        .withArgs(await borrower.getAddress(), await lender.getAddress(), borrowAmount);

      const lenderPosition = await lendingPool.lenderPositions(await lender.getAddress());
      const borrowerPosition = await lendingPool.borrowerPositions(await borrower.getAddress());

      expect(lenderPosition.amount).to.equal(lendAmount - borrowAmount);
      expect(borrowerPosition.borrowedAmount).to.equal(borrowAmount);
    });

    it("Should allow bridge to execute liquidation", async function () {
      const collateralAmount = ethers.parseEther("100");
      const liquidationAmount = ethers.parseEther("50");

      await lendingPool.connect(borrower).depositCollateral(collateralAmount);
      await expect(lendingPool.connect(polkaVMBridge).lockBorrowerPosition(await borrower.getAddress()))
        .to.emit(lendingPool, "BorrowerPositionLocked")
        .withArgs(await borrower.getAddress());

      await expect(lendingPool.connect(polkaVMBridge).executeLiquidation(
        await borrower.getAddress(),
        await lender.getAddress(),
        liquidationAmount
      ))
        .to.emit(lendingPool, "BorrowerLiquidated")
        .withArgs(await borrower.getAddress(), await lender.getAddress(), liquidationAmount);

      const borrowerPosition = await lendingPool.borrowerPositions(await borrower.getAddress());
      expect(borrowerPosition.collateralAmount).to.equal(collateralAmount - liquidationAmount);
    });
  });
});
