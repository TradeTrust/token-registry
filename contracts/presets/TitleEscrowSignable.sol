// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { TitleEscrow } from "../TitleEscrow.sol";
import { SigHelper } from "../utils/SigHelper.sol";
import { BeneficiaryTransferEndorsement } from "../lib/TitleEscrowStructs.sol";
import { ITitleEscrowSignable } from "../interfaces/ITitleEscrowSignable.sol";
import { TitleEscrowSignableErrors } from "../interfaces/TitleEscrowSignableErrors.sol";

/**
 * @title TitleEscrowSignable
 * @notice Experimental escrow that allows the holder to endorse beneficiary transfers off-chain.
 * @dev Deadline validation is a lower bound only (`deadline < block.timestamp` → expired).
 * There is no on-chain max TTL: a deadline of `type(uint256).max` never expires via time alone.
 * Integrators should choose finite deadlines off-chain. Holders can still invalidate via
 * {cancelBeneficiaryTransfer} or by advancing the holder nonce (transfer / holder change).
 * @custom:experimental See readme for usage details.
 */
contract TitleEscrowSignable is SigHelper, TitleEscrow, TitleEscrowSignableErrors, ITitleEscrowSignable {
  // solhint-disable-next-line const-name-snakecase
  string public constant name = "TradeTrust Title Escrow";

  // BeneficiaryTransfer(address beneficiary,address holder,address nominee,address registry,uint256 tokenId,uint256 deadline,uint256 nonce)
  bytes32 public constant BENEFICIARY_TRANSFER_TYPEHASH =
    0xdc8ea80c045a9b675c73cb328c225cc3f099d01bd9b7820947ac10cba8661cf1;

  function initialize(address _registry, uint256 _tokenId) public virtual override initializer {
    __TitleEscrowSignable_init(_registry, _tokenId);
  }

  // solhint-disable-next-line func-name-mixedcase
  function __TitleEscrowSignable_init(address _registry, uint256 _tokenId) internal virtual onlyInitializing {
    super.__TitleEscrow_init(_registry, _tokenId);
    super.__SigHelper_init(name, "1");
  }

  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return super.supportsInterface(interfaceId) || interfaceId == type(ITitleEscrowSignable).interfaceId;
  }

  /**
   * @dev See {ITitleEscrowSignable-transferBeneficiaryWithSig}.
   * @dev Rejects only when `endorsement.deadline < block.timestamp`. No upper bound on deadline.
   */
  function transferBeneficiaryWithSig(
    BeneficiaryTransferEndorsement memory endorsement,
    Sig memory sig
  ) public virtual override whenNotPaused whenActive onlyBeneficiary whenHoldingToken {
    if (endorsement.deadline < block.timestamp) {
      revert SignatureExpired(block.timestamp);
    }
    if (
      endorsement.nominee == address(0) ||
      endorsement.nominee == beneficiary ||
      endorsement.holder != holder ||
      endorsement.tokenId != tokenId ||
      endorsement.registry != registry
    ) {
      revert InvalidEndorsement();
    }

    if (nominee != address(0)) {
      if (endorsement.nominee != nominee) {
        revert MismatchedEndorsedNomineeAndOnChainNominee(endorsement.nominee, nominee);
      }
    }

    if (endorsement.beneficiary != beneficiary) {
      revert MismatchedEndorsedBeneficiaryAndCurrentBeneficiary(endorsement.beneficiary, beneficiary);
    }
    // Replay protection: endorsement nonce must be the holder's current nonce.
    // Cancellation may still target future nonces via endorsement.nonce in _hash.
    if (endorsement.nonce != nonces[endorsement.holder]) {
      revert InvalidEndorsement();
    }
    if (!_validateSig(_hash(endorsement), holder, sig)) {
      revert InvalidSignature();
    }

    ++nonces[holder];
    // Match transferBeneficiary: keep rejection state for the immediate predecessor.
    prevHolder = address(0);
    prevBeneficiary = beneficiary;
    remark = "0x0";
    _setBeneficiary(endorsement.nominee, "0x0");
  }

  /**
   * @dev See {ITitleEscrowSignable-cancelBeneficiaryTransfer}.
   */
  function cancelBeneficiaryTransfer(
    BeneficiaryTransferEndorsement memory endorsement
  ) public virtual override whenNotPaused whenActive {
    if (msg.sender != endorsement.holder) {
      revert CallerNotEndorser();
    }

    bytes32 hash = _hash(endorsement);
    _cancelHash(hash);

    emit CancelBeneficiaryTransferEndorsement(hash, endorsement.holder, endorsement.tokenId);
  }

  function _hash(BeneficiaryTransferEndorsement memory endorsement) internal pure returns (bytes32) {
    return
      keccak256(
        abi.encode(
          BENEFICIARY_TRANSFER_TYPEHASH,
          endorsement.beneficiary,
          endorsement.holder,
          endorsement.nominee,
          endorsement.registry,
          endorsement.tokenId,
          endorsement.deadline,
          endorsement.nonce
        )
      );
  }

  function _setHolder(address newHolder, bytes memory _remark) internal virtual override {
    ++nonces[holder];
    super._setHolder(newHolder, _remark);
  }
}
