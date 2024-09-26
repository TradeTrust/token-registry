// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./TradeTrustSBT.sol";
import "./RegistryAccess.sol";
import "../interfaces/ITradeTrustTokenRevocable.sol";

/**
 * @title TradeTrustTokenRevocable
 * @dev This contract defines the revoke functionality for the TradeTrustToken.
 */
abstract contract TradeTrustTokenRevocable is TradeTrustSBT, RegistryAccess, ITradeTrustTokenRevocable {
  /**
   * @dev Internal constant for the burn address.
   */
  address private constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
  /**
   * @dev See {ERC165Upgradeable-supportsInterface}.
   */
  function supportsInterface(
    bytes4 interfaceId
  ) public view virtual override(TradeTrustSBT, RegistryAccess) returns (bool) {
    return interfaceId == type(ITradeTrustTokenRevocable).interfaceId || super.supportsInterface(interfaceId);
  }

  /**
   * @dev See {ITradeTrustTokenRevocable-revoke}.
   */
  function revoke(
    uint256 tokenId,
    bytes calldata _remark
  ) external virtual override whenNotPaused onlyRole(DEFAULT_ADMIN_ROLE) remarkLengthLimit(_remark) returns (address) {
    if (!_exists(tokenId)) {
      revert InvalidTokenId();
    }
    address titleEscrow = titleEscrowFactory().getAddress(address(this), tokenId);

    if (ownerOf(tokenId) != titleEscrow) {
      revert TokenNotSurrendered();
    }

    ITitleEscrow(titleEscrow).revoke(_remark);
    // Burning token to 0xdead instead to show a differentiate state as address(0) is used for unminted tokens
    _registryTransferTo(BURN_ADDRESS, tokenId, "");

    return titleEscrow;
  }
}
