// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

interface ITradeTrustTokenMintable {
  /**
   * @dev Mint a TradeTrust token.
   * @param beneficiary The beneficiary of the token.
   * @param holder The holder of the token.
   * @param tokenId The ID of the token to mint.
   * @param remark The remark added by the minter
   * @return The address of the corresponding TitleEscrow.
   */
  function mint(address beneficiary, address holder, uint256 tokenId, bytes memory remark) external returns (address);
}
