// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { ISBTUpgradeable, IERC165 } from "./ISBTUpgradeable.sol";
import { ITitleEscrowFactory } from "./ITitleEscrowFactory.sol";

interface ITradeTrustSBT is IERC721Receiver, ISBTUpgradeable {
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
