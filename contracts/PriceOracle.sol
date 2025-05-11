// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PriceOracle
 * @dev Oracle contract for monitoring asset prices and collateral ratios
 * @custom:polkadot-runtime This contract is designed for Polkadot Asset Hub
 */
contract PriceOracle is Ownable {
    struct AssetPrice {
        uint256 price;
        uint256 lastUpdate;
        bool active;
    }

    // Mapping of asset address to its price data
    mapping(address => AssetPrice) public assetPrices;
    
    // Minimum time between updates
    uint256 public constant MIN_UPDATE_INTERVAL = 1 hours;
    
    event PriceUpdated(address indexed asset, uint256 price, uint256 timestamp);
    event CollateralRatioUpdated(address indexed borrower, uint256 ratio);

    /// @custom:selector constructor
    /// @notice Contract constructor
    constructor() public Ownable() {}

    /// @custom:selector update_asset_price
    /// @notice Update price for an asset
    /// @param asset The asset address
    /// @param price The new price (scaled by 1e18)
    function updateAssetPrice(address asset, uint256 price) public onlyOwner {
        require(price > 0, "Price must be greater than 0");
        
        AssetPrice storage assetPrice = assetPrices[asset];
        require(
            block.timestamp >= assetPrice.lastUpdate + MIN_UPDATE_INTERVAL,
            "Too soon to update"
        );
        
        assetPrice.price = price;
        assetPrice.lastUpdate = block.timestamp;
        assetPrice.active = true;
        
        emit PriceUpdated(asset, price, block.timestamp);
    }

    /// @custom:selector get_asset_price
    /// @notice Get the current price of an asset
    /// @param asset The asset address
    /// @return price The current price of the asset
    function getAssetPrice(address asset) public view returns (uint256) {
        AssetPrice memory assetPrice = assetPrices[asset];
        require(assetPrice.active, "Asset price not available");
        return assetPrice.price;
    }

    /// @custom:selector calculate_collateral_ratio
    /// @notice Calculate collateral ratio for a borrower
    /// @param borrower The borrower's address
    /// @param collateralAsset The collateral asset address
    /// @param debtAsset The debt asset address
    /// @param collateralAmount The amount of collateral
    /// @param debtAmount The amount of debt
    /// @return ratio The calculated collateral ratio
    function calculateCollateralRatio(
        address borrower,
        address collateralAsset,
        address debtAsset,
        uint256 collateralAmount,
        uint256 debtAmount
    ) public returns (uint256) {
        require(debtAmount > 0, "Debt amount must be greater than 0");
        
        AssetPrice memory collateralPrice = assetPrices[collateralAsset];
        AssetPrice memory debtPrice = assetPrices[debtAsset];
        
        require(collateralPrice.active && debtPrice.active, "Price data not available");
        
        uint256 collateralValue = (collateralAmount * collateralPrice.price) / 1e18;
        uint256 debtValue = (debtAmount * debtPrice.price) / 1e18;
        
        uint256 ratio = (collateralValue * 1e18) / debtValue;
        
        emit CollateralRatioUpdated(borrower, ratio);
        return ratio;
    }

    /// @custom:selector get_latest_price
    /// @notice Get latest price for an asset
    /// @param asset The asset address
    /// @return price The latest price
    function getLatestPrice(address asset) public view returns (uint256 price) {
        AssetPrice storage assetPrice = assetPrices[asset];
        require(assetPrice.active, "Price not active");
        return assetPrice.price;
    }

    /// @custom:selector is_price_active
    /// @notice Check if an asset price is active and recent
    /// @param asset The asset address
    /// @return bool True if price is active and recent
    function isPriceActive(address asset) public view returns (bool) {
        AssetPrice storage assetPrice = assetPrices[asset];
        return assetPrice.active && 
            block.timestamp <= assetPrice.lastUpdate + MIN_UPDATE_INTERVAL;
    }
}
