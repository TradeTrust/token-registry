// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { IObligationRegistryFactory } from "./interfaces/IObligationRegistryFactory.sol";
import { ObligationRegistryFactoryErrors } from "./interfaces/ObligationRegistryFactoryErrors.sol";
import { TradeTrustObligationToken } from "./TradeTrustObligationToken.sol";
import { ObligationEscrowFactory } from "./ObligationEscrowFactory.sol";

/**
 * @title ObligationRegistryFactory
 * @notice Deploys ObligationEscrowFactory once and TradeTrustObligationToken UUPS proxies that share it.
 */
contract ObligationRegistryFactory is IObligationRegistryFactory, ObligationRegistryFactoryErrors {
  address public immutable override implementation;
  address public immutable override obligationEscrowFactory;

  constructor() {
    obligationEscrowFactory = address(new ObligationEscrowFactory(msg.sender));
    implementation = address(new TradeTrustObligationToken());
  }

  /**
   * @dev See {IObligationRegistryFactory-deploy}.
   */
  function deploy(
    string calldata name,
    string calldata symbol,
    address owner
  ) external override returns (address obligationRegistry) {
    if (owner == address(0)) revert ZeroAddress();

    bytes memory initData = abi.encodeCall(
      TradeTrustObligationToken.initialize,
      (name, symbol, owner, obligationEscrowFactory)
    );
    obligationRegistry = address(new ERC1967Proxy(implementation, initData));

    emit ObligationRegistryDeployed(obligationRegistry, obligationEscrowFactory, owner, name, symbol);
  }
}
