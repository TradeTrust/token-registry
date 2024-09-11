// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract ERC721ReceiverMock is IERC721Receiver {
  enum Error {
    None,
    RevertWithMessage,
    RevertWithoutMessage,
    Panic,
    ReturnsUnexpectedValue
  }
  event TokenReceived(
    address indexed beneficiary,
    address indexed holder,
    bool indexed isMinting,
    address registry,
    uint256 tokenId,
    bytes remark
  );

  Error private _error;

  function setErrorType(Error error) external {
    _error = error;
  }

  function onERC721Received(
    address /* operator */,
    address /* from */,
    uint256 tokenId /* tokenId */,
    bytes memory data /* data */
  ) public override returns (bytes4) {
    if (_error == Error.RevertWithMessage) {
      revert("ERC721ReceiverMock: reverting");
    } else if (_error == Error.RevertWithoutMessage) {
      revert();
    } else if (_error == Error.Panic) {
      uint256 a = uint256(0) / uint256(0);
      a;
    } else if (_error == Error.ReturnsUnexpectedValue) {
      return bytes4(0x12345678);
    }
    (address _beneficiary, address _holder, bytes memory _remark) = abi.decode(data, (address, address, bytes));
    emit TokenReceived(_beneficiary, _holder, true, msg.sender, tokenId, _remark);
    return IERC721Receiver.onERC721Received.selector;
  }
}
