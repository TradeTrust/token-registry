// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC165 } from "@openzeppelin/contracts/interfaces/IERC165.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { BeaconProxy } from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import { UpgradeableBeacon } from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import { ObligationEscrow } from "./ObligationEscrow.sol";
import { IObligationEscrow } from "./interfaces/IObligationEscrow.sol";
import { IObligationEscrowFactory } from "./interfaces/IObligationEscrowFactory.sol";
import { ObligationEscrowFactoryErrors } from "./interfaces/ObligationEscrowFactoryErrors.sol";

/**
 * @title ObligationEscrowFactory
 * @notice Deploys upgradeable ObligationEscrow beacon proxies per title.
 */
contract ObligationEscrowFactory is IObligationEscrowFactory, ObligationEscrowFactoryErrors, Ownable2Step {
  address public override beacon;

  /**
   * @notice Creates a new ObligationEscrowFactory contract.
   * @dev Deploys the escrow implementation and an UpgradeableBeacon owned by this factory contract
   * itself (not `owner_` directly) — `upgradeEscrowImplementation` below is the only way to move the
   * beacon, and it in turn is gated by this factory's own `Ownable`, set to `owner_`. Beacon ownership
   * can't be given directly to `owner_`, because `UpgradeableBeacon.upgradeTo` is only ever called
   * *from* this factory contract (see `upgradeEscrowImplementation`), so the beacon's owner must be
   * `address(this)` for that internal call to pass the beacon's own `onlyOwner` check.
   * @param owner_ The address to receive ownership of this factory (and therefore upgrade rights,
   * via `upgradeEscrowImplementation`). When this factory is deployed from within another contract's
   * constructor (e.g. ObligationRegistryFactory), `msg.sender` would resolve to that deploying
   * contract rather than an externally owned account, so the owner must be passed explicitly instead
   * of defaulting to `msg.sender`.
   */
  constructor(address owner_) Ownable(owner_) {
    address escrowImplementation = address(new ObligationEscrow());
    beacon = address(new UpgradeableBeacon(escrowImplementation, address(this)));
  }

  /**
   * @dev See {IObligationEscrowFactory-implementation}.
   */
  function implementation() external view override returns (address) {
    return UpgradeableBeacon(beacon).implementation();
  }

  /**
   * @dev See {IObligationEscrowFactory-create}.
   */
  function create(uint256 tokenId) external override returns (address) {
    if (tx.origin == msg.sender) {
      revert CreateCallerNotContract();
    }
    bytes32 salt = keccak256(abi.encodePacked(msg.sender, tokenId));
    bytes memory initData = abi.encodeCall(ObligationEscrow.initialize, (msg.sender, tokenId));
    address titleEscrow = address(new BeaconProxy{salt: salt}(beacon, initData));

    emit ObligationEscrowCreated(titleEscrow, msg.sender, tokenId);

    return titleEscrow;
  }

  /**
   * @dev See {IObligationEscrowFactory-getEscrowAddress}.
   */
  function getEscrowAddress(address tokenRegistry, uint256 tokenId) external view override returns (address) {
    bytes32 salt = keccak256(abi.encodePacked(tokenRegistry, tokenId));
    bytes memory initData = abi.encodeCall(ObligationEscrow.initialize, (tokenRegistry, tokenId));
    bytes memory bytecode = abi.encodePacked(type(BeaconProxy).creationCode, abi.encode(beacon, initData));
    return Create2.computeAddress(salt, keccak256(bytecode), address(this));
  }

  /**
   * @dev See {IObligationEscrowFactory-upgradeEscrowImplementation}.
   * @notice Requires `newImplementation` to advertise the `IObligationEscrow` interface via ERC-165,
   * as a sanity check against upgrading to an incompatible implementation by mistake. This is not a
   * substitute for reviewing the new implementation's storage layout — every ObligationEscrow across
   * every registry sharing this factory switches to it immediately.
   */
  function upgradeEscrowImplementation(address newImplementation) external override onlyOwner {
    if (
      newImplementation.code.length == 0 ||
      !IERC165(newImplementation).supportsInterface(type(IObligationEscrow).interfaceId)
    ) {
      revert InvalidEscrowImplementation(newImplementation);
    }
    UpgradeableBeacon(beacon).upgradeTo(newImplementation);
  }
}
