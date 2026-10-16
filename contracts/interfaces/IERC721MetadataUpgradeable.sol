// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (token/ERC721/extensions/IERC721Metadata.sol)

pragma solidity ^0.8.20;

import { ISBTUpgradeable } from "./ISBTUpgradeable.sol";

/**
 * @title SBT metadata extension (ERC-721-shaped)
 * @notice Optional name/symbol/tokenURI helpers for {ISBTUpgradeable}.
 * This is **not** the canonical ERC-721 metadata interface: the base token interface
 * uses a custom four-argument `transferFrom` and omits approvals.
 * @dev Naming retains historical "IERC721MetadataUpgradeable" for compatibility; do not
 * treat `supportsInterface` for this type as EIP-721 compliance.
 */
interface IERC721MetadataUpgradeable is ISBTUpgradeable {
  /**
   * @dev Returns the token collection name.
   */
  function name() external view returns (string memory);

  /**
   * @dev Returns the token collection symbol.
   */
  function symbol() external view returns (string memory);

  /**
   * @dev Returns the Uniform Resource Identifier (URI) for `tokenId` token.
   */
  function tokenURI(uint256 tokenId) external view returns (string memory);
}
