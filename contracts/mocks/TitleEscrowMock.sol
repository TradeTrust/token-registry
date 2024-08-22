// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../TitleEscrow.sol";

contract TitleEscrowMock is TitleEscrow {
  constructor() TitleEscrow() {}

  function setActive(bool val) public {
    active = val;
  }

  // function to initialize the mock which also sets the beneficiary, holder and nominee
  function initializeMock(
    address _registry,
    uint256 _tokenId,
    address _beneficiary,
    address _holder,
    address _nominee
  ) public {
    registry = _registry;
    tokenId = _tokenId;
    beneficiary = _beneficiary;
    holder = _holder;
    nominee = _nominee;
    active = true;
  }
}
