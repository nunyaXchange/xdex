// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LendingPool
 * @dev Manages deposits of lenders and collateral of borrowers on Ethereum
 */
contract LendingPool is ReentrancyGuard, Ownable {
    struct LenderPosition {
        uint256 amount;
        bool isLocked;
    }

    struct BorrowerPosition {
        uint256 collateralAmount;
        uint256 borrowedAmount;
        bool isLocked;
    }

    // Mapping of lender address to their position
    mapping(address => LenderPosition) public lenderPositions;
    
    // Mapping of borrower address to their position
    mapping(address => BorrowerPosition) public borrowerPositions;

    // Contract address on PolkaVM that is authorized to trigger actions
    address public polkaVMBridge;
    
    // The ERC20 token used for lending and borrowing
    IERC20 public token;

    event LenderDeposit(address indexed lender, uint256 amount);
    event LenderWithdraw(address indexed lender, uint256 amount);
    event BorrowerCollateralDeposit(address indexed borrower, uint256 amount);
    event BorrowerCollateralWithdraw(address indexed borrower, uint256 amount);
    event BorrowerLiquidated(address indexed borrower, address indexed lender, uint256 amount);
    event LenderPositionLocked(address indexed lender);
    event LenderPositionUnlocked(address indexed lender);
    event BorrowerPositionLocked(address indexed borrower);
    event BorrowerPositionUnlocked(address indexed borrower);
    event BorrowExecuted(address indexed borrower, address indexed lender, uint256 amount);

    modifier onlyPolkaVMBridge() {
        require(msg.sender == polkaVMBridge, "Only PolkaVM bridge can call this");
        _;
    }

    constructor(address _token) {
        require(_token != address(0), "Token address cannot be zero");
        token = IERC20(_token);
        polkaVMBridge = msg.sender;
    }

    function setPolkaVMBridge(address _bridge) external onlyOwner {
        require(_bridge != address(0), "Bridge address cannot be zero");
        polkaVMBridge = _bridge;
    }

    /**
     * @dev Lender deposits assets they're willing to lend
     * @param amount The amount to deposit
     */
    function depositLenderAssets(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(!lenderPositions[msg.sender].isLocked, "Position is locked");
        
        lenderPositions[msg.sender].amount += amount;
        
        // Transfer tokens from lender to this contract
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        emit LenderDeposit(msg.sender, amount);
    }

    /**
     * @dev Borrower deposits collateral
     * @param amount The amount of collateral to deposit
     */
    function depositCollateral(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(!borrowerPositions[msg.sender].isLocked, "Position is locked");
        
        borrowerPositions[msg.sender].collateralAmount += amount;
        
        // Transfer collateral tokens from borrower to this contract
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        emit BorrowerCollateralDeposit(msg.sender, amount);
    }

    /**
     * @dev Lock a lender's position (called by PolkaVM bridge when match is found)
     * @param lender The address of the lender
     */
    function lockLenderPosition(address lender) external onlyPolkaVMBridge {
        require(!lenderPositions[lender].isLocked, "Already locked");
        require(lenderPositions[lender].amount > 0, "No position to lock");
        
        lenderPositions[lender].isLocked = true;
        emit LenderPositionLocked(lender);
    }

    /**
     * @dev Lock a borrower's position (called by PolkaVM bridge when match is found)
     * @param borrower The address of the borrower
     */
    function lockBorrowerPosition(address borrower) external onlyPolkaVMBridge {
        require(!borrowerPositions[borrower].isLocked, "Already locked");
        require(borrowerPositions[borrower].collateralAmount > 0, "No position to lock");
        
        borrowerPositions[borrower].isLocked = true;
        emit BorrowerPositionLocked(borrower);
    }

    /**
     * @dev Execute a borrow operation (called by PolkaVM bridge)
     * @param borrower The borrower's address
     * @param lender The lender's address
     * @param amount The amount to borrow
     */
    function executeBorrow(address borrower, address lender, uint256 amount) external onlyPolkaVMBridge {
        require(lenderPositions[lender].isLocked, "Lender position not locked");
        require(borrowerPositions[borrower].isLocked, "Borrower position not locked");
        require(lenderPositions[lender].amount >= amount, "Insufficient lender funds");
        
        lenderPositions[lender].amount -= amount;
        borrowerPositions[borrower].borrowedAmount += amount;
        
        // Transfer tokens from contract to borrower
        require(token.transfer(borrower, amount), "Transfer failed");
        
        emit BorrowExecuted(borrower, lender, amount);
    }

    /**
     * @dev Execute liquidation of a borrower's position (called by PolkaVM bridge)
     * @param borrower The borrower's address
     * @param lender The lender's address
     * @param amount The amount to liquidate
     */
    function executeLiquidation(address borrower, address lender, uint256 amount) external onlyPolkaVMBridge {
        require(borrowerPositions[borrower].isLocked, "Borrower position not locked");
        require(borrowerPositions[borrower].collateralAmount >= amount, "Insufficient collateral");
        
        borrowerPositions[borrower].collateralAmount -= amount;
        
        // Transfer liquidated collateral to lender
        require(token.transfer(lender, amount), "Transfer failed");
        
        emit BorrowerLiquidated(borrower, lender, amount);
    }

    /**
     * @dev Allow withdrawal of excess collateral (called by PolkaVM bridge)
     * @param borrower The borrower's address
     * @param amount The amount of collateral to withdraw
     */
    function withdrawExcessCollateral(address borrower, uint256 amount) external onlyPolkaVMBridge {
        require(borrowerPositions[borrower].isLocked, "Position not locked");
        require(borrowerPositions[borrower].collateralAmount >= amount, "Insufficient collateral");
        
        borrowerPositions[borrower].collateralAmount -= amount;
        
        // Transfer excess collateral back to borrower
        require(token.transfer(borrower, amount), "Transfer failed");
        
        emit BorrowerCollateralWithdraw(borrower, amount);
    }
}
