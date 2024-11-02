// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

interface TDocDeployerErrors {
  error UnsupportedImplementationContractAddress();

  error ImplementationInitializationFailure(bytes payload);

  error ImplementationAlreadyAdded();

  error InvalidImplementation();
}
