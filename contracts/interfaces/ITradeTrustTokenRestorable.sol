// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

interface ITradeTrustTokenRestorable {
  /**
   * @dev Restore a token returned to issuer.
   * @param tokenId The ID of the token to restore.
   * @return The address of the TitleEscrow contract.
   */
  function restore(uint256 tokenId, bytes memory remark) external returns (address);
}
