// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @custom:polkadot-runtime
/// @custom:version 1.0.0
/// @custom:language solidity
/// @custom:target polkavm
contract PriceOracle {
    uint256 private price;

    /// @custom:selector init
    /// @custom:payable
    /// @custom:mutates-storage
    constructor() payable {
        price = 0;
    }

    /// @custom:selector set
    /// @custom:mutates-storage
    function set(uint256 newPrice) external payable {
        price = newPrice;
    }

    /// @custom:selector get
    /// @custom:view
    function get() external view returns (uint256) {
        return price;
    }
}
