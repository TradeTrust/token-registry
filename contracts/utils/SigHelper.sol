// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { SigHelperErrors } from "../interfaces/SigHelperErrors.sol";

/**
 * @title SigHelper
 * @notice EIP-712 signature helpers for experimental TitleEscrowSignable flows.
 * @dev Domain separator uses an OpenZeppelin-style cache that is invalidated when
 * `block.chainid` changes (e.g. a chain-ID-changing fork), so endorsements do not
 * remain valid across such forks. Domain fields live in ERC-7201 namespaced storage
 * so appending them does not shift inherited TitleEscrow storage layout.
 */
abstract contract SigHelper is SigHelperErrors {
  using ECDSA for bytes32;

  /// @dev Former `DOMAIN_SEPARATOR` public storage slot; retained for layout compatibility.
  bytes32 private __deprecatedDomainSeparator;

  mapping(address => uint256) public nonces;
  mapping(bytes32 => bool) public cancelled;

  /// @custom:storage-location erc7201:tradetrust.storage.SigHelperDomain
  struct SigHelperDomainStorage {
    bytes32 hashedName;
    bytes32 hashedVersion;
    bytes32 cachedDomainSeparator;
    uint256 cachedChainId;
  }

  // keccak256(abi.encode(uint256(keccak256("tradetrust.storage.SigHelperDomain")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 private constant SIGHELPER_DOMAIN_STORAGE_LOCATION =
    0x9e9b3aff00e0ae142206bb5ff87df1de242547286189f7ee6132c310e5cef200;

  struct Sig {
    bytes32 r;
    bytes32 s;
    uint8 v;
  }

  function _getSigHelperDomainStorage() private pure returns (SigHelperDomainStorage storage $) {
    assembly {
      $.slot := SIGHELPER_DOMAIN_STORAGE_LOCATION
    }
  }

  function __SigHelper_init(string memory name, string memory version) internal {
    SigHelperDomainStorage storage $ = _getSigHelperDomainStorage();
    $.hashedName = keccak256(bytes(name));
    $.hashedVersion = keccak256(bytes(version));
    $.cachedChainId = block.chainid;
    $.cachedDomainSeparator = _buildDomainSeparator($);
  }

  /**
   * @notice Current EIP-712 domain separator for this contract.
   * @dev Rebuilds when `block.chainid` differs from the value cached at init/last match.
   * Falls back to the legacy storage slot if the contract was initialised before this fix.
   */
  function DOMAIN_SEPARATOR() public view returns (bytes32) {
    return _domainSeparator();
  }

  function _domainSeparator() internal view returns (bytes32) {
    SigHelperDomainStorage storage $ = _getSigHelperDomainStorage();
    if ($.hashedName == bytes32(0)) {
      return __deprecatedDomainSeparator;
    }
    if (block.chainid == $.cachedChainId) {
      return $.cachedDomainSeparator;
    }
    return _buildDomainSeparator($);
  }

  function _buildDomainSeparator(SigHelperDomainStorage storage $) private view returns (bytes32) {
    return
      keccak256(
        abi.encode(
          keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
          $.hashedName,
          $.hashedVersion,
          block.chainid,
          address(this)
        )
      );
  }

  function _validateSig(bytes32 hash, address signer, Sig memory sig) internal view virtual returns (bool) {
    if (cancelled[hash]) {
      revert SignatureAlreadyCancelled();
    }
    bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), hash));
    address rSigner = digest.recover(abi.encodePacked(sig.r, sig.s, sig.v));
    return rSigner != address(0) && rSigner == signer;
  }

  function _cancelHash(bytes32 hash) internal virtual {
    if (cancelled[hash]) {
      revert SignatureAlreadyCancelled();
    }
    cancelled[hash] = true;
  }
}
