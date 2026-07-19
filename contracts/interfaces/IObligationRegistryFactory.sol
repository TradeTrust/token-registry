// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title IObligationRegistryFactory
 * @notice Deploys TrustVCToken UUPS proxies bound to an ObligationEscrowFactory.
 */
interface IObligationRegistryFactory {
  event ObligationRegistryDeployed(
    address indexed obligationRegistry,
    address indexed obligationEscrowFactory,
    address indexed owner,
    string name,
    string symbol
  );

  function implementation() external view returns (address);

  function obligationEscrowFactory() external view returns (address);

  /**
   * @notice Deploys a TrustVCToken proxy.
   * @param name Token name.
   * @param symbol Token symbol.
   * @param owner Admin / UUPS owner (receives registry roles).
   */
  function deploy(string calldata name, string calldata symbol, address owner) external returns (address obligationRegistry);
}
