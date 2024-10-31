// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../interfaces/ITitleEscrowFactory.sol";

contract TitleEscrowFactoryGetterMock {
  address private titleEscrowAddress;
  function callCreate(address titleEscrowFactory, uint256 tokenId) public {
    ITitleEscrowFactory(titleEscrowFactory).create(tokenId);
  }

  //setting the address of the titleEscrow contract so that it returns correct address when called by registry
  function setAddress(address _titleEscrowAddress) public {
    titleEscrowAddress = _titleEscrowAddress;
  }
  function getEscrowAddress(address tokenRegistry, uint256 tokenId) external view returns (address) {
    if (titleEscrowAddress == address(0)) {
      return ITitleEscrowFactory(tokenRegistry).getEscrowAddress(tokenRegistry, tokenId);
    }
    return titleEscrowAddress;
  }
}
