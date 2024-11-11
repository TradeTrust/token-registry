// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

interface TradeTrustTokenErrors {
  error TokenNotReturnedToIssuer();

  error InvalidTokenId();

  error TokenExists();

  error TransferFailure();

  error RemarkLengthExceeded();
}
