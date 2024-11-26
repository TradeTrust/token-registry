// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import { SBTUpgradeable } from "./SBTUpgradeable.sol";
import { ITitleEscrow, IERC721Receiver } from "../interfaces/ITitleEscrow.sol";
import { ITitleEscrowFactory } from "../interfaces/ITitleEscrowFactory.sol";
import { TradeTrustTokenErrors } from "../interfaces/TradeTrustTokenErrors.sol";
import { ITradeTrustSBT, IERC165 } from "../interfaces/ITradeTrustSBT.sol";

/**
 * @title TradeTrustSBT
 */
abstract contract TradeTrustSBT is SBTUpgradeable, PausableUpgradeable, TradeTrustTokenErrors, ITradeTrustSBT {
  /**
   * @dev Modifier to check if the bytes length is within the limit
   */
  modifier remarkLengthLimit(bytes calldata _remark) {
    if (_remark.length > 120) revert RemarkLengthExceeded();
    _;
  }
  /**
   * @dev Initialise the contract.
   * @param name The name of the token.
   * @param symbol The symbol of the token.
   */
  function __TradeTrustSBT_init(string memory name, string memory symbol) internal onlyInitializing {
    __SBT_init(name, symbol);
    __Pausable_init();
  }

  /**
   * @dev See {ERC165Upgradeable-supportsInterface}.
   */
  function supportsInterface(bytes4 interfaceId) public view virtual override(SBTUpgradeable, IERC165) returns (bool) {
    return interfaceId == type(ITradeTrustSBT).interfaceId || SBTUpgradeable.supportsInterface(interfaceId);
  }

  /**
   * @dev See {IERC721ReceiverUpgradeable-onERC721Received}.
   */
  function onERC721Received(
    address /* _operator */,
    address /* _from */,
    uint256 /* _tokenId */,
    bytes memory /* _data */
  ) public pure override returns (bytes4) {
    return IERC721Receiver.onERC721Received.selector;
  }

  /**
   * @dev Transfer a token to the registry.
   * @param to The address of the registry.
   * @param tokenId The ID of the token to transfer.
   */
  function _registryTransferTo(address to, uint256 tokenId, bytes memory _remark) internal {
    this.transferFrom(address(this), to, tokenId, _remark);
  }

  /**
   * @dev See {SBTUpgradeable-_beforeTokenTransfer}.
   */
  function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal virtual override whenNotPaused {
    super._beforeTokenTransfer(from, to, tokenId);
  }

  /**
   * @dev See {ITradeTrustSBT-genesis}.
   */
  function genesis() public view virtual override returns (uint256);

  /**
   * @dev See {ITradeTrustSBT-titleEscrowFactory}.
   */
  function titleEscrowFactory() public view virtual override returns (ITitleEscrowFactory);
}
