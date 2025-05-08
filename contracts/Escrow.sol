// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.20;

/**
 * @title Escrow Contract
 * @dev A simple escrow contract that holds funds until approved by an arbiter.
 * The contract facilitates a secure transaction between a depositor and a beneficiary,
 * with an arbiter who has the authority to release the funds.
 * @author UtkarshBhardwaj007
 */

/**
 * @title Escrow
 * @dev A simple escrow contract that holds funds until approved by an arbiter.
 * The contract facilitates a secure transaction between a depositor and a beneficiary,
 * with an arbiter who has the authority to release the funds.
 */
contract Escrow {
    /**
     * @dev Emitted when the arbiter approves the release of funds
     * @param amount The amount of Ether released to the beneficiary
     */
    event Approved(uint256 amount);

    /// @notice The address that initially deposited the funds
    address public depositor;

    /// @notice The address that will receive the funds when approved
    address public beneficiary;

    /// @notice The address authorized to approve the fund release
    address public arbiter;

    /**
     * @dev Sets up the escrow with the specified arbiter and beneficiary
     * @param _arbiter Address of the arbiter who can approve fund release
     * @param _beneficiary Address that will receive the funds when approved
     */
    constructor(address _arbiter, address _beneficiary) payable {
        arbiter = _arbiter;
        beneficiary = _beneficiary;
        depositor = msg.sender;
    }

    /**
     * @dev Releases the contract's funds to the beneficiary
     * @notice Can only be called by the arbiter
     * @notice Emits an Approved event upon successful transfer
     */
    function approve() external {
        require(msg.sender == arbiter, "Only arbiter can approve");
        uint256 balance = address(this).balance;
        (bool sent, ) = beneficiary.call{value: balance}("");
        require(sent, "Failed to send Ether");
        emit Approved(balance);
    }
}
