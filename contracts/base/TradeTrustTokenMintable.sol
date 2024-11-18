// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { TradeTrustSBT, ITitleEscrow, SBTUpgradeable } from "./TradeTrustSBT.sol";
import { RegistryAccess } from "./RegistryAccess.sol";
import { ITradeTrustTokenMintable } from "../interfaces/ITradeTrustTokenMintable.sol";

/**
 * @title TradeTrustTokenMintable
 * @dev This contract defines the mint functionality for the TradeTrustToken.
 */
abstract contract TradeTrustTokenMintable is TradeTrustSBT, RegistryAccess, ITradeTrustTokenMintable {
  /**
   * @dev See {ERC165Upgradeable-supportsInterface}.
   */
  function supportsInterface(
    bytes4 interfaceId
  ) public view virtual override(TradeTrustSBT, RegistryAccess) returns (bool) {
    return interfaceId == type(ITradeTrustTokenMintable).interfaceId || super.supportsInterface(interfaceId);
  }

  /**
   * @dev See {ITradeTrustTokenMintable-mint}.
   */
  function mint(
    address beneficiary,
    address holder,
    uint256 tokenId,
    bytes calldata _remark
  ) external virtual override whenNotPaused onlyRole(MINTER_ROLE) returns (address) {
    return _mintTitle(beneficiary, holder, tokenId, _remark);
  }

  /**
   * @dev Internal function to mint a TradeTrust token.
   * @param beneficiary The beneficiary of the token.
   * @param holder The holder of the token.
   * @param tokenId The ID of the token to mint.
   * @return The address of the corresponding TitleEscrow.
   */
  function _mintTitle(
    address beneficiary,
    address holder,
    uint256 tokenId,
    bytes calldata _remark
  ) internal virtual remarkLengthLimit(_remark) returns (address) {
    if (_exists(tokenId)) {
      revert TokenExists();
    }

    address newTitleEscrow = titleEscrowFactory().create(tokenId);
    _safeMint(newTitleEscrow, tokenId, abi.encode(beneficiary, holder, _remark));

    return newTitleEscrow;
  }
}
