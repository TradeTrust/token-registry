// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { TradeTrustSBT } from "./TradeTrustSBT.sol";
import { ITitleEscrow } from "../interfaces/ITitleEscrow.sol";
import { RegistryAccess } from "./RegistryAccess.sol";
import { ITradeTrustTokenBurnable } from "../interfaces/ITradeTrustTokenBurnable.sol";

/**
 * @title TradeTrustTokenBurnable
 * @notice Burn sends the token to {BURN_ADDRESS} (`0xdEaD`), not `address(0)`.
 * @dev Lifecycle for integrators:
 * - `address(0)` owner → unminted ( `_exists` is false ).
 * - `0xdEaD` owner → burned ( `_exists` remains true; tokenId cannot be re-minted on this registry ).
 * Do not treat `_exists(tokenId)` alone as “active title”; check owner / escrow state.
 */
abstract contract TradeTrustTokenBurnable is TradeTrustSBT, RegistryAccess, ITradeTrustTokenBurnable {
  /**
   * @dev Burn sink address. Distinct from `address(0)` so unminted vs burned stay distinguishable.
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
   * @dev Shreds the escrow then transfers the token to {BURN_ADDRESS}.
   * @param tokenId The ID of the token to burn.
   * @dev After burn, `_exists(tokenId)` stays true; the same `tokenId` cannot be minted again on this registry.
   */
  function _burnTitle(uint256 tokenId, bytes calldata _remark) internal virtual {
    address titleEscrow = titleEscrowFactory().getEscrowAddress(address(this), tokenId);
    ITitleEscrow(titleEscrow).shred(_remark);

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
