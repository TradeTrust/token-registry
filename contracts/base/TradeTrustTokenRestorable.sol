// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { TradeTrustSBT, ITitleEscrow, SBTUpgradeable } from "./TradeTrustSBT.sol";
import { RegistryAccess } from "./RegistryAccess.sol";
import { ITradeTrustTokenRestorable } from "../interfaces/ITradeTrustTokenRestorable.sol";

/**
 * @title TradeTrustTokenRestorable
 * @dev This contract defines the restore functionality for the TradeTrustToken.
 */
abstract contract TradeTrustTokenRestorable is TradeTrustSBT, RegistryAccess, ITradeTrustTokenRestorable {
  /**
   * @dev See {ERC165Upgradeable-supportsInterface}.
   */
  function supportsInterface(
    bytes4 interfaceId
  ) public view virtual override(TradeTrustSBT, RegistryAccess) returns (bool) {
    return interfaceId == type(ITradeTrustTokenRestorable).interfaceId || super.supportsInterface(interfaceId);
  }

  /**
   * @dev See {ITradeTrustTokenRestorable-restore}.
   */
  function restore(
    uint256 tokenId,
    bytes calldata _remark
  ) external virtual override whenNotPaused onlyRole(RESTORER_ROLE) remarkLengthLimit(_remark) returns (address) {
    if (!_exists(tokenId)) {
      revert InvalidTokenId();
    }
    if (ownerOf(tokenId) != address(this)) {
      revert TokenNotReturnedToIssuer();
    }

    address titleEscrow = titleEscrowFactory().getEscrowAddress(address(this), tokenId);
    _registryTransferTo(titleEscrow, tokenId, _remark);

    return titleEscrow;
  }
}
