// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { RegistryAccess } from "./RegistryAccess.sol";
import { TradeTrustTokenBurnable, TradeTrustSBT, SBTUpgradeable } from "./TradeTrustTokenBurnable.sol"; //check-circular-imports
import { TradeTrustTokenMintable, TradeTrustSBT, SBTUpgradeable } from "./TradeTrustTokenMintable.sol";
import { TradeTrustTokenRestorable, TradeTrustSBT, SBTUpgradeable } from "./TradeTrustTokenRestorable.sol";
import { ITradeTrustToken, ITitleEscrowFactory } from "../interfaces/ITradeTrustToken.sol"; //check-circular-imports
import { TradeTrustTokenBaseURI } from "./TradeTrustTokenBaseURI.sol";

/**
 * @title TradeTrustTokenBase
 * @dev Base token contract for TradeTrust tokens.
 */
abstract contract TradeTrustTokenBase is
  TradeTrustSBT,
  RegistryAccess,
  TradeTrustTokenBaseURI,
  TradeTrustTokenBurnable,
  TradeTrustTokenMintable,
  TradeTrustTokenRestorable
{
  /**
   * @dev Initializss the contract by setting a `name` and a `symbol` to the token contract.
   * @param name The name of the token contract.
   * @param symbol The symbol of the token contract.
   */
  function __TradeTrustTokenBase_init(
    string memory name,
    string memory symbol,
    address admin
  ) internal onlyInitializing {
    __TradeTrustSBT_init(name, symbol);
    __RegistryAccess_init(admin);
  }

  /**
   * @dev See {ERC165Upgradeable-supportsInterface}.
   */
  function supportsInterface(
    bytes4 interfaceId
  )
    public
    view
    virtual
    override(
      TradeTrustSBT,
      RegistryAccess,
      TradeTrustTokenBaseURI,
      TradeTrustTokenRestorable,
      TradeTrustTokenMintable,
      TradeTrustTokenBurnable
    )
    returns (bool)
  {
    return interfaceId == type(ITradeTrustToken).interfaceId || super.supportsInterface(interfaceId);
  }

  /**
   * @dev Pauses all token transfers.
   * @notice Requires the caller to be admin.
   */
  function pause(bytes calldata _remark) external onlyRole(DEFAULT_ADMIN_ROLE) remarkLengthLimit(_remark) {
    _pause();
    remark = _remark;
    emit PauseWithRemark(msg.sender, _remark);
  }

  /**
   * @dev Unpauses all token transfers.
   * @notice Requires the caller to be admin.
   */
  function unpause(bytes calldata _remark) external onlyRole(DEFAULT_ADMIN_ROLE) remarkLengthLimit(_remark) {
    _unpause();
    remark = _remark;
    emit UnpauseWithRemark(msg.sender, _remark);
  }

  /**
   * @dev See {SBTUpgradeable-_beforeTokenTransfer}.
   */
  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId
  ) internal virtual override(TradeTrustSBT, TradeTrustTokenBurnable) whenNotPaused {
    super._beforeTokenTransfer(from, to, tokenId);

    address titleEscrow = titleEscrowFactory().getEscrowAddress(address(this), tokenId);
    if (to != address(this) && to != titleEscrow && to != BURN_ADDRESS) {
      revert TransferFailure();
    }
  }

  /**
   * @dev See {TradeTrustTokenBaseURI-_baseURI}.
   */
  function _baseURI() internal view virtual override(SBTUpgradeable, TradeTrustTokenBaseURI) returns (string memory) {
    return super._baseURI();
  }
}
