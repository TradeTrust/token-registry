// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { TradeTrustTokenBase, ITitleEscrowFactory } from "./base/TradeTrustTokenBase.sol";
import { ITrustVCToken } from "./interfaces/ITrustVCToken.sol";
import { TrustVCTokenErrors } from "./interfaces/TrustVCTokenErrors.sol";

/**
 * @title TrustVCToken
 * @notice SBT registry for obligation titles (classic TradeTrustToken deploy shape).
 * @dev Status lifecycle lives on ObligationEscrow (same pattern as TradeTrustToken + TitleEscrowFactory).
 */
contract TrustVCToken is TradeTrustTokenBase, ITrustVCToken, TrustVCTokenErrors {
  address internal immutable _obligationEscrowFactory;
  uint256 internal immutable _genesis;

  /**
   * @notice Creates a new TrustVCToken contract.
   * @param name The name of the token.
   * @param symbol The symbol of the token.
   * @param obligationEscrowFactory_ The ObligationEscrowFactory address.
   */
  constructor(string memory name, string memory symbol, address obligationEscrowFactory_) {
    if (obligationEscrowFactory_ == address(0)) revert ZeroAddress();
    if (obligationEscrowFactory_.code.length == 0) revert InvalidObligationEscrowFactory();

    _genesis = block.number;
    _obligationEscrowFactory = obligationEscrowFactory_;
    initialize(name, symbol, _msgSender());
  }

  /**
   * @notice Initializes roles/admin (mirrors TradeTrustToken).
   * @param name The name of the token.
   * @param symbol The symbol of the token.
   * @param admin The address of the admin.
   */
  function initialize(string memory name, string memory symbol, address admin) internal initializer {
    __TradeTrustTokenBase_init(name, symbol, admin);
  }

  /**
   * @dev See {ITradeTrustSBT-titleEscrowFactory}.
   */
  function titleEscrowFactory() public view override returns (ITitleEscrowFactory) {
    return ITitleEscrowFactory(_obligationEscrowFactory);
  }

  /**
   * @dev See {ITrustVCToken-obligationEscrowFactory}.
   */
  function obligationEscrowFactory() external view override returns (address) {
    return _obligationEscrowFactory;
  }

  /**
   * @dev See {ITradeTrustSBT-genesis}.
   */
  function genesis() public view override returns (uint256) {
    return _genesis;
  }

  /**
   * @dev See {ITrustVCToken-burnFromEscrow}.
   */
  function burnFromEscrow(uint256 tokenId, bytes calldata remark) external override whenNotPaused remarkLengthLimit(remark) {
    address escrow = titleEscrowFactory().getEscrowAddress(address(this), tokenId);
    if (msg.sender != escrow) revert CallerNotEscrow();
    _registryTransferTo(BURN_ADDRESS, tokenId, remark);
  }
}
