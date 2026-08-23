// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Permissive EIP-7702 delegation target so empty/ping calls cannot revert for unrelated reasons.
contract Noop {
  event Pinged();

  function ping() external {
    emit Pinged();
  }

  receive() external payable {}

  fallback() external payable {}
}
