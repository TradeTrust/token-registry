// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/**
 * @title ITitleEscrow
 * @notice Interface for TitleEscrow contract. The TitleEscrow contract represents a title escrow for transferable records.
 * @dev Inherits from IERC721Receiver.
 */
interface ITitleEscrow is IERC721Receiver {
  event TokenReceived(
    address indexed beneficiary,
    address indexed holder,
    bool indexed isMinting,
    address registry,
    uint256 tokenId,
    bytes remark
  );
  event Nomination(
    address indexed prevNominee,
    address indexed nominee,
    address registry,
    uint256 tokenId,
    bytes remark
  );
  event BeneficiaryTransfer(
    address indexed fromBeneficiary,
    address indexed toBeneficiary,
    address registry,
    uint256 tokenId,
    bytes remark
  );
  event HolderTransfer(
    address indexed fromHolder,
    address indexed toHolder,
    address registry,
    uint256 tokenId,
    bytes remark
  );
  event ReturnToIssuer(address indexed caller, address registry, uint256 tokenId, bytes remark);
  event Shred(address registry, uint256 tokenId, bytes remark);
  event RejectTransferOwners(
    address indexed fromBeneficiary,
    address indexed toBeneficiary,
    address indexed fromHolder,
    address toHolder,
    address registry,
    uint256 tokenId,
    bytes remark
  );
  event RejectTransferBeneficiary(
    address indexed fromBeneficiary,
    address indexed toBeneficiary,
    address registry,
    uint256 tokenId,
    bytes remark
  );
  event RejectTransferHolder(
    address indexed fromHolder,
    address indexed toHolder,
    address registry,
    uint256 tokenId,
    bytes remark
  );

  /**
   * @notice Allows the beneficiary to nominate a new beneficiary
   * @dev The nominated beneficiary will need to be transferred by the holder to become the actual beneficiary
   * @param nominee The address of the nominee
   */
  function nominate(address nominee, bytes calldata remark) external;

  /**
   * @notice Allows the holder to transfer the beneficiary role to the nominated beneficiary or to themselves
   * @param nominee The address of the new beneficiary
   */
  function transferBeneficiary(address nominee, bytes calldata remark) external;

  /**
   * @notice Allows the holder to transfer their role to another address
   * @param newHolder The address of the new holder
   */
  function transferHolder(address newHolder, bytes calldata remark) external;

  /**
   * @notice Allows for the simultaneous transfer of both beneficiary and holder roles
   * @param nominee The address of the new beneficiary
   * @param newHolder The address of the new holder
   */
  function transferOwners(address nominee, address newHolder, bytes calldata remark) external;

  /**
   * @notice Allows the new beneficiary to reject the nomination
   * @param _remark The remark for the rejection
   */
  function rejectTransferBeneficiary(bytes calldata _remark) external;

  /**
   * @notice Allows the new holder to reject the transfer of the holder role
   * @param _remark The remark for the rejection
   */
  function rejectTransferHolder(bytes calldata _remark) external;

  /**
   * @notice Allows the new beneficiary and holder to reject the transfer of both roles
   * @param _remark The remark for the rejection
   */
  function rejectTransferOwners(bytes calldata _remark) external;

  function beneficiary() external view returns (address);

  function holder() external view returns (address);

  function prevBeneficiary() external view returns (address);

  function prevHolder() external view returns (address);

  function active() external view returns (bool);

  function nominee() external view returns (address);

  function registry() external view returns (address);

  function tokenId() external view returns (uint256);

  /**
   * @notice Check if the TitleEscrow is currently holding a token
   * @return A boolean indicating whether the contract is holding a token
   */
  function isHoldingToken() external returns (bool);

  /**
   * @notice Allows the beneficiary and holder to returnToIssuer the token back to the registry
   */
  function returnToIssuer(bytes calldata remark) external;

  /**
   * @notice Allows the registry to shred the TitleEscrow by marking it as inactive and reset the beneficiary and holder addresses
   */
  function shred(bytes calldata remark) external;
}
