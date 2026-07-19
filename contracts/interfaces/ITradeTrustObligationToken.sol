// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title ITradeTrustObligationToken
 * @notice Thin SBT registry for obligation titles; lifecycle lives on ObligationEscrow.
 */
interface ITradeTrustObligationToken {
  function obligationEscrowFactory() external view returns (address);

  /**
   * @notice Burns a title after reject/discharge; callable only by the title's escrow.
   */
  function burnFromEscrow(uint256 tokenId, bytes calldata remark) external;
}
