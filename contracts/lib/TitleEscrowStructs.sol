// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
  @dev BeneficiaryTransferEndorsement represents the endorsement details.
       The beneficiary is the transfer proposer, holder is the endorser, nominee is the endorsed nominee, registry is
       the token registry, tokenId is the token id, deadline is the unix expiry (seconds; no on-chain max TTL —
       use a finite value off-chain; cancel/nonce still revoke), and nonce is the holder's endorsement nonce.
*/
struct BeneficiaryTransferEndorsement {
  address beneficiary;
  address holder;
  address nominee;
  address registry;
  uint256 tokenId;
  uint256 deadline;
  uint256 nonce;
}
