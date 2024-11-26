// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { RegistryAccessErrors } from "../interfaces/RegistryAccessErrors.sol";

/**
 * @title RegistryAccess
 * @dev Abstract contract handling access for the registry.
 */
abstract contract RegistryAccess is AccessControlUpgradeable, RegistryAccessErrors {
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
  bytes32 public constant RESTORER_ROLE = keccak256("RESTORER_ROLE");
  bytes32 public constant ACCEPTER_ROLE = keccak256("ACCEPTER_ROLE");

  /**
   * @notice Initialises the contract by setting up roles for the given admin address.
   * @param admin The address of the admin role.
   */
  function __RegistryAccess_init(address admin) internal onlyInitializing {
    if (admin == address(0)) {
      revert InvalidAdminAddress();
    }
    _grantRole(DEFAULT_ADMIN_ROLE, admin);
    _grantRole(MINTER_ROLE, admin);
    _grantRole(RESTORER_ROLE, admin);
    _grantRole(ACCEPTER_ROLE, admin);
  }

  /**
   * @inheritdoc AccessControlUpgradeable
   */
  function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControlUpgradeable) returns (bool) {
    return super.supportsInterface(interfaceId);
  }

  /**
   * @notice Sets the admin role to a new address.
   */
  function setRoleAdmin(bytes32 role, bytes32 adminRole) public virtual onlyRole(DEFAULT_ADMIN_ROLE) {
    _setRoleAdmin(role, adminRole);
  }
}
