// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { IObligationEscrow } from "./IObligationEscrow.sol";

interface ObligationEscrowErrors {
  error CallerNotBeneficiary();

  error CallerNotHolder();

  error TitleEscrowNotHoldingToken();

  error RegistryContractPaused();

  error InactiveTitleEscrow();

  error InvalidTokenId(uint256 tokenId);

  error InvalidRegistry(address registry);

  error EmptyReceivingData();

  error InvalidTokenTransferToZeroAddressOwners(address beneficiary, address holder);

  error TargetNomineeAlreadyBeneficiary();

  error NomineeAlreadyNominated();

  error InvalidTransferToZeroAddress();

  error InvalidNominee();

  error RecipientAlreadyHolder();

  error TokenNotReturnedToIssuer();

  error RemarkLengthExceeded();

  error DualRoleRejectionRequired();

  error NotRegistered();

  error OwnerHolderMustDiffer();

  error InvalidStatusTransition(IObligationEscrow.Status currentStatus, IObligationEscrow.Status requiredStatus);
}
