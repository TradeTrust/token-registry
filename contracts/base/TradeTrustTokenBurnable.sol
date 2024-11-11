// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

import { TradeTrustSBT, ITitleEscrow, SBTUpgradeable } from "./TradeTrustSBT.sol";
import { RegistryAccess } from "./RegistryAccess.sol";
import { ITradeTrustTokenBurnable } from "../interfaces/ITradeTrustTokenBurnable.sol";

/**
 * @title TradeTrustTokenBurnable
 * @dev This contract defines the burn functionality for the TradeTrustToken.
 */
abstract contract TradeTrustTokenBurnable is TradeTrustSBT, RegistryAccess, ITradeTrustTokenBurnable {
  /**
   * @dev Internal constant for the burn address.
   */
  address internal constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

  /**
   * @dev See {ERC165Upgradeable-supportsInterface}.
   */
  function supportsInterface(
    bytes4 interfaceId
  ) public view virtual override(TradeTrustSBT, RegistryAccess) returns (bool) {
    return interfaceId == type(ITradeTrustTokenBurnable).interfaceId || super.supportsInterface(interfaceId);
  }

  /**
   * @dev See {ITradeTrustTokenBurnable-burn}.
   */
  function burn(
    uint256 tokenId,
    bytes calldata _remark
  ) external virtual override whenNotPaused onlyRole(ACCEPTER_ROLE) remarkLengthLimit(_remark) {
    _burnTitle(tokenId, _remark);
  }

  /**
   * @dev Internal function to burn a token.
   * @param tokenId The ID of the token to burn.
   */
  function _burnTitle(uint256 tokenId, bytes calldata _remark) internal virtual {
    address titleEscrow = titleEscrowFactory().getEscrowAddress(address(this), tokenId);
    ITitleEscrow(titleEscrow).shred(_remark);

    // Burning token to 0xdead instead to show a differentiate state as address(0) is used for unminted tokens
    _registryTransferTo(BURN_ADDRESS, tokenId, "");
  }

  /**
   * @dev See {SBTUpgradeable-_beforeTokenTransfer}.
   */
  function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal virtual override {
    if (to == BURN_ADDRESS && ownerOf(tokenId) != address(this)) {
      revert TokenNotReturnedToIssuer();
    }
    super._beforeTokenTransfer(from, to, tokenId);
  }
}
