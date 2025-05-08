// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract SupplyChainVerifier is AccessControl {
    // Define roles
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant RETAILER_ROLE = keccak256("RETAILER_ROLE");

    // Product struct
    struct Product {
        uint256 id;
        string name;
        string origin;
        uint256 manufacturingDate;
        address manufacturer;
        bool isVerified;
        string metadata;
    }

    // Events
    event ProductRegistered(uint256 productId, string name, address manufacturer);
    event ProductVerified(uint256 productId, address verifier);

    // Product tracking
    mapping(uint256 => Product) public products;
    uint256 private _productIds;

    constructor() {
        // Setup the admin role for the contract deployer
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // Register a new product (manufacturer only)
    function registerProduct(
        string memory name,
        string memory origin,
        string memory metadata
    ) public onlyRole(MANUFACTURER_ROLE) returns (uint256) {
        _productIds += 1;
        uint256 newProductId = _productIds;

        products[newProductId] = Product({
            id: newProductId,
            name: name,
            origin: origin,
            manufacturingDate: block.timestamp,
            manufacturer: msg.sender,
            isVerified: false,
            metadata: metadata
        });

        emit ProductRegistered(newProductId, name, msg.sender);
        return newProductId;
    }

    // Verify a product (distributor or retailer)
    function verifyProduct(uint256 productId) public {
        require(
            hasRole(DISTRIBUTOR_ROLE, msg.sender) || hasRole(RETAILER_ROLE, msg.sender),
            "Must have distributor or retailer role"
        );
        require(products[productId].id != 0, "Product does not exist");

        products[productId].isVerified = true;
        emit ProductVerified(productId, msg.sender);
    }

    // Add a distributor
    function addDistributor(address account) public onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(DISTRIBUTOR_ROLE, account);
    }

    // Add a retailer
    function addRetailer(address account) public onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(RETAILER_ROLE, account);
    }

    // Get product details
    function getProduct(uint256 productId) public view returns (Product memory) {
        require(products[productId].id != 0, "Product does not exist");
        return products[productId];
    }

    // Get product count
    function getProductCount() public view returns (uint256) {
        return _productIds;
    }
}
