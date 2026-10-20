// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { RegistryAccessErrors } from "../interfaces/RegistryAccessErrors.sol";

/**
 * @title RegistryAccess
 * @notice Role bootstrap and hierarchy helpers for token registries.
 *
 * @dev Initialisation grants `DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, `RESTORER_ROLE`, and
 * `ACCEPTER_ROLE` to a single `admin` address for deploy convenience. That concentrates
 * privilege on one account until operators split roles (recommended: multisig for
 * `DEFAULT_ADMIN_ROLE`, separate EOAs/contracts for minter/restorer/accepter, then
 * revoke operational roles from the bootstrap admin).
 *
 * `setRoleAdmin` takes effect immediately with no on-chain timelock. Treat it as a
 * sensitive admin operation; use a secured admin key (e.g. multisig) and off-chain
 * change control if delayed activation is required.
 */
abstract contract RegistryAccess is AccessControlUpgradeable, RegistryAccessErrors {
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
  bytes32 public constant RESTORER_ROLE = keccak256("RESTORER_ROLE");
  bytes32 public constant ACCEPTER_ROLE = keccak256("ACCEPTER_ROLE");

  /**
   * @notice Initialises access control by granting all registry roles to `admin`.
   * @param admin Bootstrap address that receives DEFAULT_ADMIN_ROLE and the operational roles.
   * @dev Operators should reassign and revoke roles after deployment; see contract notice.
   */
  // solhint-disable-next-line func-name-mixedcase
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
   * @notice Sets which role is the admin of `role` (OpenZeppelin role hierarchy).
   * @dev Immediate effect; only `DEFAULT_ADMIN_ROLE`. No timelock — harden the admin key
   * (e.g. multisig) and use operational change control for sensitive hierarchy updates.
   */
  function setRoleAdmin(bytes32 role, bytes32 adminRole) public virtual onlyRole(DEFAULT_ADMIN_ROLE) {
    _setRoleAdmin(role, adminRole);
  }
}
