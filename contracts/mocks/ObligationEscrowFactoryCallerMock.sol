// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { IObligationEscrowFactory } from "../interfaces/IObligationEscrowFactory.sol";

contract ObligationEscrowFactoryCallerMock {
  function callCreate(address obligationEscrowFactory, uint256 tokenId) public {
    IObligationEscrowFactory(obligationEscrowFactory).create(tokenId);
  }
}
