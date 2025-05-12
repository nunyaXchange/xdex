// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IPriceOracle.sol";

contract LendingPoolBridge is Ownable {
    struct VTLRange {
        uint256 lower; // Lower bound of VTL range (multiplied by 100)
        uint256 upper; // Upper bound of VTL range (multiplied by 100)
    }

    struct LenderOffer {
        uint256 amount;
        VTLRange vtlRange;
        bool isActive;
        bool proofVerified;
        uint256 wrappedTokenBalance;
    }

    struct BorrowerRequest {
        uint256 collateralAmount;
        uint256 requestedAmount;
        VTLRange vtlRange;
        bool isActive;
        bool proofVerified;
        uint256 wrappedCollateralBalance;
    }

    IPriceOracle public immutable oracle;
    address public immutable lendingPoolEVMContractAddress;
    IERC20 public immutable wrappedToken;

    mapping(address => LenderOffer) public lenderOffers;
    mapping(address => BorrowerRequest) public borrowerRequests;
    mapping(address => uint256) public liquidityPool;

    event LenderOfferCreated(address indexed lender, uint256 amount, uint256 lowerVTL, uint256 upperVTL);
    event BorrowerRequestCreated(address indexed borrower, uint256 collateralAmount, uint256 requestedAmount, uint256 lowerVTL, uint256 upperVTL);
    event BorrowerCollateralRatioUpdated(address indexed borrower, uint256 newRatio);
    event LenderProofVerified(address indexed lender, uint256 amount);
    event BorrowerProofVerified(address indexed borrower, uint256 amount);
    event LenderWrappedTokensGenerated(address indexed lender, uint256 amount);
    event BorrowerWrappedTokensGenerated(address indexed borrower, uint256 amount);
    event MatchFound(address indexed lender, address indexed borrower, uint256 amount);

    constructor(
        address _oracle,
        address _lendingPoolEVMContractAddress,
        address _wrappedToken
    ) Ownable(msg.sender) {
        oracle = IPriceOracle(_oracle);
        lendingPoolEVMContractAddress = _lendingPoolEVMContractAddress;
        wrappedToken = IERC20(_wrappedToken);
    }

    function createLenderOffer(
        uint256 amount,
        uint256 lowerVTL,
        uint256 upperVTL
    ) external {
        require(amount > 0, "Amount must be greater than 0");
        require(lowerVTL < upperVTL, "Invalid VTL range");
        require(!lenderOffers[msg.sender].isActive, "Offer already exists");

        lenderOffers[msg.sender] = LenderOffer({
            amount: amount,
            vtlRange: VTLRange({
                lower: lowerVTL,
                upper: upperVTL
            }),
            isActive: true,
            proofVerified: false,
            wrappedTokenBalance: 0
        });

        emit LenderOfferCreated(msg.sender, amount, lowerVTL, upperVTL);
    }

    function createBorrowerRequest(
        uint256 collateralAmount,
        uint256 requestedAmount,
        uint256 lowerVTL,
        uint256 upperVTL
    ) external {
        require(collateralAmount > 0, "Collateral must be greater than 0");
        require(requestedAmount > 0, "Requested amount must be greater than 0");
        require(lowerVTL < upperVTL, "Invalid VTL range");
        require(!borrowerRequests[msg.sender].isActive, "Request already exists");

        borrowerRequests[msg.sender] = BorrowerRequest({
            collateralAmount: collateralAmount,
            requestedAmount: requestedAmount,
            vtlRange: VTLRange({
                lower: lowerVTL,
                upper: upperVTL
            }),
            isActive: true,
            proofVerified: false,
            wrappedCollateralBalance: 0
        });

        emit BorrowerRequestCreated(msg.sender, collateralAmount, requestedAmount, lowerVTL, upperVTL);
    }

    function verifyProof(
        address account,
        bool isLender,
        uint256 amount,
        bytes memory proof
    ) external {
        if (isLender) {
            require(lenderOffers[account].isActive, "No active lender offer");
            require(!lenderOffers[account].proofVerified, "Proof already verified");
            require(amount == lenderOffers[account].amount, "Amount mismatch");

            _verifyProofInRust(account, proof);
            lenderOffers[account].proofVerified = true;
            lenderOffers[account].wrappedTokenBalance = amount;

            emit LenderProofVerified(account, amount);
            emit LenderWrappedTokensGenerated(account, amount);
        } else {
            require(borrowerRequests[account].isActive, "No active borrower request");
            require(!borrowerRequests[account].proofVerified, "Proof already verified");
            require(amount == borrowerRequests[account].collateralAmount, "Amount mismatch");

            _verifyProofInRust(account, proof);
            borrowerRequests[account].proofVerified = true;
            borrowerRequests[account].wrappedCollateralBalance = amount;

            emit BorrowerProofVerified(account, amount);
            emit BorrowerWrappedTokensGenerated(account, amount);
        }
    }

    function findMatch(address lender, address borrower) external {
        LenderOffer storage offer = lenderOffers[lender];
        BorrowerRequest storage request = borrowerRequests[borrower];

        require(offer.isActive && offer.proofVerified, "Invalid lender offer");
        require(request.isActive && request.proofVerified, "Invalid borrower request");

        // Check VTL range overlap
        require(
            offer.vtlRange.lower <= request.vtlRange.upper &&
            offer.vtlRange.upper >= request.vtlRange.lower,
            "No VTL range overlap"
        );

        uint256 matchedAmount = request.requestedAmount;
        require(offer.wrappedTokenBalance >= matchedAmount, "Insufficient lender balance");

        // Update balances
        offer.wrappedTokenBalance -= matchedAmount;
        liquidityPool[lender] += matchedAmount;

        emit MatchFound(lender, borrower, matchedAmount);
    }

    function updateCollateralRatio(address borrower, uint256 newRatio) external {
        require(msg.sender == address(oracle), "Only oracle can update ratio");
        require(borrowerRequests[borrower].isActive, "No active request");

        emit BorrowerCollateralRatioUpdated(borrower, newRatio);

        // Check if liquidation is needed
        if (newRatio < borrowerRequests[borrower].vtlRange.lower) {
            borrowerRequests[borrower].isActive = false;
        }
    }

    function _verifyProofInRust(address account, bytes memory proof) internal pure {
        // This will be replaced with actual Rust verification
        require(proof.length > 0, "Invalid proof");
    }
}
