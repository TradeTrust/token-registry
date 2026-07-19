// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

interface IObligationEscrowFactory {
  event ObligationEscrowCreated(address indexed titleEscrow, address indexed tokenRegistry, uint256 indexed tokenId);

  function implementation() external view returns (address);

  function beacon() external view returns (address);

  /**
   * @notice Creates a new beacon proxy of the ObligationEscrow contract and initializes it.
   * @dev The function will revert if it is called by an EOA.
   * @param tokenId The ID of the token.
   * @return The address of the newly created ObligationEscrow contract.
   */
  function create(uint256 tokenId) external returns (address);

  /**
   * @notice Returns the address of an ObligationEscrow contract for the provided token registry and token ID.
   * @param tokenRegistry The address of the token registry.
   * @param tokenId The ID of the token.
   * @return The address of the ObligationEscrow contract.
   */
  function getEscrowAddress(address tokenRegistry, uint256 tokenId) external view returns (address);

  /**
   * @notice Upgrades the shared ObligationEscrow implementation for all beacon proxies.
   * @param newImplementation The new implementation address.
   */
  function upgradeEscrowImplementation(address newImplementation) external;
}
