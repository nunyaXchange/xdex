const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PriceOracle", function () {
  let PriceOracle;
  let priceOracle;
  let owner;
  let user;
  let asset1;
  let asset2;

  beforeEach(async function () {
    PriceOracle = await ethers.getContractFactory("PriceOracle");
    [owner, user, asset1, asset2] = await ethers.getSigners();
    priceOracle = await PriceOracle.deploy();
  });

  describe("Price Updates", function () {
    it("Should allow owner to update asset price", async function () {
      const price = ethers.parseEther("100"); // $100
      await expect(priceOracle.updateAssetPrice(asset1.address, price))
        .to.emit(priceOracle, "PriceUpdated")
        .withArgs(asset1.address, price);

      const assetPrice = await priceOracle.assetPrices(asset1.address);
      expect(assetPrice.price).to.equal(price);
      expect(assetPrice.active).to.equal(true);
    });

    it("Should not allow non-owner to update price", async function () {
      const price = ethers.parseEther("100");
      await expect(priceOracle.connect(user).updateAssetPrice(asset1.address, price))
        .to.be.revertedWithCustomError(priceOracle, 'OwnableUnauthorizedAccount');
    });

    it("Should not allow price update before minimum interval", async function () {
      const price = ethers.parseEther("100");
      await priceOracle.updateAssetPrice(asset1.address, price);

      await expect(
        priceOracle.updateAssetPrice(asset1.address, price)
      ).to.be.revertedWith("Too soon to update");
    });

    it("Should allow price update after minimum interval", async function () {
      const price1 = ethers.parseEther("100");
      const price2 = ethers.parseEther("120");

      await priceOracle.updateAssetPrice(asset1.address, price1);
      await ethers.provider.send("evm_increaseTime", [3600]); // Increase time by 1 hour
      await ethers.provider.send("evm_mine");

      await priceOracle.updateAssetPrice(asset1.address, price2);
      const assetPrice = await priceOracle.assetPrices(asset1.address);
      expect(assetPrice.price).to.equal(price2);
    });
  });

  describe("Collateral Ratio Calculation", function () {
    beforeEach(async function () {
      // Set up initial prices
      await priceOracle.updateAssetPrice(asset1.address, ethers.parseEther("100")); // Collateral
      await priceOracle.updateAssetPrice(asset2.address, ethers.parseEther("1")); // Borrowed
    });

    it("Should calculate correct collateral ratio", async function () {
      const collateralAmount = ethers.parseEther("1"); // 1 unit of asset1 ($100)
      const borrowedAmount = ethers.parseEther("50"); // 50 units of asset2 ($50)

      const ratio = await priceOracle.calculateCollateralRatio(
        asset1.address,
        asset2.address,
        collateralAmount,
        borrowedAmount
      );

      expect(ratio).to.equal(200); // 200% or 2.0x collateral ratio
    });

    it("Should revert if borrowed amount is zero", async function () {
      await expect(
        priceOracle.calculateCollateralRatio(
          asset1.address,
          asset2.address,
          ethers.parseEther("1"),
          0
        )
      ).to.be.revertedWith("Borrowed amount must be greater than 0");
    });

    it("Should revert if prices are not active", async function () {
      const newAsset = ethers.Wallet.createRandom().address;

      await expect(
        priceOracle.calculateCollateralRatio(
          newAsset,
          asset2.address,
          ethers.parseEther("1"),
          ethers.parseEther("1")
        )
      ).to.be.revertedWith("Prices not active");
    });
  });

  describe("Price Queries", function () {
    it("Should return latest price for active asset", async function () {
      const price = ethers.parseEther("100");
      await priceOracle.updateAssetPrice(asset1.address, price);

      const latestPrice = await priceOracle.getLatestPrice(asset1.address);
      expect(latestPrice).to.equal(price);
    });

    it("Should revert when querying inactive asset", async function () {
      await expect(
        priceOracle.getLatestPrice(asset1.address)
      ).to.be.revertedWith("Price not active");
    });

    it("Should correctly report price activity status", async function () {
      const price = ethers.parseEther("100");
      await priceOracle.updateAssetPrice(asset1.address, price);

      expect(await priceOracle.isPriceActive(asset1.address)).to.equal(true);

      await ethers.provider.send("evm_increaseTime", [3601]); // Increase time by more than 1 hour
      await ethers.provider.send("evm_mine");
      expect(await priceOracle.isPriceActive(asset1.address)).to.equal(false);
    });
  });
});
