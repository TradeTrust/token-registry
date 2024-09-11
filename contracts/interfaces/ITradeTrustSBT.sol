// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";
import "./ISBTUpgradeable.sol";
import "./ITitleEscrowFactory.sol";

interface ITradeTrustSBT is IERC721ReceiverUpgradeable, ISBTUpgradeable {
  // Event emitted when the contract is paused with a remark.
  event PauseWithRemark(address account, bytes remark);

  // Event emitted when the contract is unpaused with a remark.
  event UnpauseWithRemark(address account, bytes remark);
  /**
   * @notice Returns the block number when the contract was created.
   * @return The block number of the contract's creation.
   */
  function genesis() external view returns (uint256);

  /**
   * @notice Returns the TitleEscrowFactory address associated with this contract.
   * @return The address of the TitleEscrowFactory contract.
   */
  function titleEscrowFactory() external view returns (ITitleEscrowFactory);
}
