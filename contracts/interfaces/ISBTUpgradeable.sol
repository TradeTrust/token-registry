// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (token/ERC721/IERC721.sol)

pragma solidity ^0.8.20;

import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title Soulbound Token (SBT) core interface
 * @notice Custom, non-canonical token interface inspired by ERC-721 shape (balanceOf/ownerOf/Transfer)
 * but **not** a full {IERC721} implementation.
 *
 * Intentionally differs from ERC-721:
 * - Transfer entrypoint is `transferFrom(address,address,uint256,bytes)` (includes a remark),
 *   which has a different selector than canonical `transferFrom(address,address,uint256)`.
 * - No `approve` / `setApprovalForAll` / `getApproved` / `isApprovedForAll`.
 * - Callers must integrate against {ISBTUpgradeable}, not assume standard IERC721 tooling.
 */
interface ISBTUpgradeable is IERC165 {
  /**
   * @dev Emitted when `tokenId` token is transferred from `from` to `to`.
   */
  event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

  /**
   * @dev Returns the number of tokens in ``owner``'s account.
   */
  function balanceOf(address owner) external view returns (uint256 balance);

  /**
   * @dev Returns the owner of the `tokenId` token.
   *
   * Requirements:
   *
   * - `tokenId` must exist.
   */
  function ownerOf(uint256 tokenId) external view returns (address owner);

  /**
   * @dev Transfers `tokenId` from `from` to `to` with an attached `_remark`.
   *
   * This is **not** the canonical ERC-721 `transferFrom(address,address,uint256)`.
   * Only the token owner may call; approvals are intentionally unsupported (SBT design).
   *
   * Requirements:
   *
   * - `from` cannot be the zero address.
   * - `to` cannot be the zero address.
   * - `tokenId` token must exist and be owned by `from`.
   * - Caller must be the token owner.
   * - If `to` refers to a smart contract, it must implement {IERC721Receiver-onERC721Received}.
   *
   * Emits a {Transfer} event.
   */
  function transferFrom(address from, address to, uint256 tokenId, bytes memory remark) external;
}
