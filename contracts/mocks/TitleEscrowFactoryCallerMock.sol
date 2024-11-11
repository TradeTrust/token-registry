// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

import { ITitleEscrowFactory } from "../interfaces/ITitleEscrowFactory.sol";

contract TitleEscrowFactoryCallerMock {
  function callCreate(address titleEscrowFactory, uint256 tokenId) public {
    ITitleEscrowFactory(titleEscrowFactory).create(tokenId);
  }
}
