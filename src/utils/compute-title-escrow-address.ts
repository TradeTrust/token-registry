import { ethers } from "ethers";

interface Params {
  implementationAddress: string;
  factoryAddress: string;
  registryAddress: string;
  tokenId: string;
}

export const computeTitleEscrowAddress = (params: Params) => {
  const { implementationAddress, factoryAddress, registryAddress, tokenId } = params;
  const initCodeHash = ethers.keccak256(
    `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${implementationAddress.substring(2)}5af43d82803e903d91602b57fd5bf3`
  );
  const salt = ethers.solidityPackedKeccak256(
    ["bytes"],
    [ethers.solidityPacked(["address", "uint256"], [registryAddress, tokenId])]
  );
  return ethers.getCreate2Address(factoryAddress, salt, initCodeHash);
};
