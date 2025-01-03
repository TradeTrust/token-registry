// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

interface ITradeTrustTokenBurnable {
  /**
   * @dev Burn a token.
   * @param tokenId The ID of the token to burn.
   */
  function burn(uint256 tokenId, bytes memory remark) external;
}
