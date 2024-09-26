// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

interface ITradeTrustTokenRevocable {
  /**
   * @dev revoke a surrendered token.
   * @param tokenId The ID of the token to revoke.
   * @return The address of the TitleEscrow contract.
   */
  function revoke(uint256 tokenId, bytes memory remark) external returns (address);
}
