// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./openzeppelin/contracts/access/Ownable.sol";

/// @custom:polkadot-runtime
/// @custom:version 1.0.0
/// @custom:language solidity
/// @custom:target polkavm
contract PriceOracle is Ownable {
    struct AssetPrice {
        uint256 price;
        uint256 lastUpdate;
        bool active;
    }

    uint256 public constant MIN_UPDATE_INTERVAL = 3600; // 1 hour in seconds
    mapping(address => AssetPrice) public assetPrices;

    event PriceUpdated(address indexed asset, uint256 price);

    /// @custom:selector init
    /// @custom:payable
    /// @custom:mutates-storage
    constructor() payable {}

    /// @custom:selector set
    /// @custom:mutates-storage
    function updateAssetPrice(address asset, uint256 price) external onlyOwner {
        AssetPrice storage assetPrice = assetPrices[asset];
        require(
            !assetPrice.active || 
            block.timestamp >= assetPrice.lastUpdate + MIN_UPDATE_INTERVAL,
            "Too soon to update"
        );

        assetPrices[asset] = AssetPrice({
            price: price,
            lastUpdate: block.timestamp,
            active: true
        });

        emit PriceUpdated(asset, price);
    }

    /// @custom:selector get
    /// @custom:view
    function getLatestPrice(address asset) external view returns (uint256) {
        require(isPriceActive(asset), "Price not active");
        return assetPrices[asset].price;
    }

    function isPriceActive(address asset) public view returns (bool) {
        AssetPrice memory assetPrice = assetPrices[asset];
        return assetPrice.active && 
               block.timestamp <= assetPrice.lastUpdate + MIN_UPDATE_INTERVAL;
    }

    function calculateCollateralRatio(
        address user,
        address collateralAsset,
        address borrowedAsset,
        uint256 collateralAmount,
        uint256 borrowedAmount
    ) external view returns (uint256) {
        require(borrowedAmount > 0, "Borrowed amount must be greater than 0");
        
        require(isPriceActive(collateralAsset) && isPriceActive(borrowedAsset), "Prices not active");
        
        AssetPrice memory collateralPrice = assetPrices[collateralAsset];
        AssetPrice memory borrowedPrice = assetPrices[borrowedAsset];
        
        uint256 collateralValue = (collateralAmount * collateralPrice.price) / 1e18;
        uint256 borrowedValue = (borrowedAmount * borrowedPrice.price) / 1e18;
        
        return (collateralValue * 100) / borrowedValue; // Returns percentage (e.g., 150 for 150%)
    }
}
