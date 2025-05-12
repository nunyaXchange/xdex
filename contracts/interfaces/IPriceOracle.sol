// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPriceOracle {
    struct AssetPrice {
        uint256 price;
        uint256 lastUpdateTime;
        bool active;
    }

    event PriceUpdated(address indexed asset, uint256 price);
    
    function updateAssetPrice(address asset, uint256 price) external;
    function getLatestPrice(address asset) external view returns (uint256);
    function calculateCollateralRatio(
        address account,
        address collateralAsset,
        address borrowedAsset,
        uint256 collateralAmount,
        uint256 borrowedAmount
    ) external view returns (uint256);
    function isPriceActive(address asset) external view returns (bool);
}
