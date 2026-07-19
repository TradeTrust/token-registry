// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { TradeTrustTokenBase, ITitleEscrowFactory } from "./base/TradeTrustTokenBase.sol";
import { ITradeTrustObligationToken } from "./interfaces/ITradeTrustObligationToken.sol";
import { TradeTrustObligationTokenErrors } from "./interfaces/TradeTrustObligationTokenErrors.sol";

/**
 * @title TradeTrustObligationToken
 * @notice Upgradeable SBT registry for obligation titles; status lifecycle lives on ObligationEscrow.
 */
contract TradeTrustObligationToken is
  TradeTrustTokenBase,
  Ownable2StepUpgradeable,
  UUPSUpgradeable,
  ITradeTrustObligationToken,
  TradeTrustObligationTokenErrors
{
  address private _obligationEscrowFactory;
  uint256 private _genesis;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @notice Initializes the UUPS proxy.
   * @param name Token name.
   * @param symbol Token symbol.
   * @param admin Registry admin (roles + Ownable for upgrades).
   * @param obligationEscrowFactory_ ObligationEscrowFactory address.
   */
  function initialize(
    string memory name,
    string memory symbol,
    address admin,
    address obligationEscrowFactory_
  ) external initializer {
    if (admin == address(0) || obligationEscrowFactory_ == address(0)) revert ZeroAddress();
    if (obligationEscrowFactory_.code.length == 0) revert InvalidObligationEscrowFactory();

    __TradeTrustTokenBase_init(name, symbol, admin);
    __Ownable_init(admin);
    __UUPSUpgradeable_init();

    _genesis = block.number;
    _obligationEscrowFactory = obligationEscrowFactory_;
  }

  /**
   * @dev See {ITradeTrustSBT-titleEscrowFactory}.
   */
  function titleEscrowFactory() public view override returns (ITitleEscrowFactory) {
    return ITitleEscrowFactory(_obligationEscrowFactory);
  }

  /**
   * @dev See {ITradeTrustObligationToken-obligationEscrowFactory}.
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
   * @dev See {ITradeTrustObligationToken-burnFromEscrow}.
   */
  function burnFromEscrow(uint256 tokenId, bytes calldata remark) external override whenNotPaused remarkLengthLimit(remark) {
    address escrow = titleEscrowFactory().getEscrowAddress(address(this), tokenId);
    if (msg.sender != escrow) revert CallerNotEscrow();
    _registryTransferTo(BURN_ADDRESS, tokenId, "");
  }

  function _authorizeUpgrade(address) internal view override onlyOwner {}

  /**
   * @dev Storage gap for upgrades.
   */
  uint256[48] private __gap;
}
