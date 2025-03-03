// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { TDocDeployerErrors } from "../interfaces/TDocDeployerErrors.sol";

/**
 * @title TDocDeployer
 * @dev Deployer for transferable documents
 */
contract TDocDeployer is OwnableUpgradeable, UUPSUpgradeable, TDocDeployerErrors {
  event Deployment(
    address indexed deployed,
    address indexed implementation,
    address indexed deployer,
    address titleEscrowFactory,
    bytes params
  );

  event AddImplementation(address indexed implementation, address indexed titleEscrowFactory);

  // mapping: implementation => title escrow factory
  mapping(address => address) public implementations;

  constructor() initializer {}

  function initialize() external initializer {
    __Ownable_init(msg.sender);
  }

  function _authorizeUpgrade(address) internal view override onlyOwner {}

  function deploy(address implementation, bytes memory params) external returns (address) {
    address titleEscrowFactory = implementations[implementation];
    if (titleEscrowFactory == address(0)) {
      revert UnsupportedImplementationContractAddress();
    }

    address deployed = Clones.clone(implementation);
    bytes memory payload = abi.encodeWithSignature("initialize(bytes)", abi.encode(params, titleEscrowFactory));
    (bool success, ) = address(deployed).call(payload);
    if (!success) {
      revert ImplementationInitializationFailure(payload);
    }

    emit Deployment(deployed, implementation, msg.sender, titleEscrowFactory, params);
    return deployed;
  }

  function addImplementation(address implementation, address titleEscrowFactory) external onlyOwner {
    if (implementations[implementation] != address(0)) {
      revert ImplementationAlreadyAdded();
    }
    implementations[implementation] = titleEscrowFactory;

    emit AddImplementation(implementation, titleEscrowFactory);
  }

  function removeImplementation(address implementation) external onlyOwner {
    if (implementations[implementation] == address(0)) {
      revert InvalidImplementation();
    }
    delete implementations[implementation];
  }
}
