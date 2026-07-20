// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { ObligationEscrow } from "./ObligationEscrow.sol";
import { IObligationEscrowFactory } from "./interfaces/IObligationEscrowFactory.sol";
import { ObligationEscrowFactoryErrors } from "./interfaces/ObligationEscrowFactoryErrors.sol";

/**
 * @title ObligationEscrowFactory
 * @notice Deploys non-upgradeable ObligationEscrow clones (EIP-1167), matching TitleEscrowFactory.
 */
contract ObligationEscrowFactory is IObligationEscrowFactory, ObligationEscrowFactoryErrors {
  address public override implementation;

  /**
   * @notice Creates a new ObligationEscrowFactory contract.
   * @dev Sets `implementation` with the address of a newly created ObligationEscrow contract.
   */
  constructor() {
    implementation = address(new ObligationEscrow());
  }

  /**
   * @dev See {IObligationEscrowFactory-create}.
   */
  function create(uint256 tokenId) external override returns (address) {
    if (tx.origin == msg.sender) {
      revert CreateCallerNotContract();
    }
    bytes32 salt = keccak256(abi.encodePacked(msg.sender, tokenId));
    address titleEscrow = Clones.cloneDeterministic(implementation, salt);
    ObligationEscrow(titleEscrow).initialize(msg.sender, tokenId);

    emit ObligationEscrowCreated(titleEscrow, msg.sender, tokenId);

    return titleEscrow;
  }

  /**
   * @dev See {IObligationEscrowFactory-getEscrowAddress}.
   */
  function getEscrowAddress(address tokenRegistry, uint256 tokenId) external view override returns (address) {
    return Clones.predictDeterministicAddress(implementation, keccak256(abi.encodePacked(tokenRegistry, tokenId)));
  }
}
