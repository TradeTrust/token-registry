// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleCaller {
  /**
   * @dev Calls a function of another contract.
   * @param target The address of the target contract.
   * @param data The calldata (including function selector and encoded parameters).
   */
  function callFunction(address target, bytes calldata data) public payable returns (bytes memory) {
    require(target != address(0), "Invalid target address");

    // Call the function
    (bool success, bytes memory result) = target.call{ value: msg.value }(data);

    require(success, "Function call failed");
    return result;
  }
}
