// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { ITradeTrustSBT } from "./ITradeTrustSBT.sol";
import { ITradeTrustTokenRestorable } from "./ITradeTrustTokenRestorable.sol";
import { ITradeTrustTokenBurnable } from "./ITradeTrustTokenBurnable.sol";
import { ITradeTrustTokenMintable } from "./ITradeTrustTokenMintable.sol";

// solhint-disable-next-line no-empty-blocks
interface ITradeTrustToken is
  ITradeTrustTokenMintable,
  ITradeTrustTokenBurnable,
  ITradeTrustTokenRestorable,
  ITradeTrustSBT
{}
