import { ethers as packedEthers } from "ethers";

const ethers = { ...packedEthers };

export interface Params {
  name: string;
  symbol: string;
  deployer: string;
}

if (ethers.version.startsWith("6.")) {
  (ethers as any).utils = {
    defaultAbiCoder: (ethers as any).AbiCoder.defaultAbiCoder(),
  };
}

export const encodeInitParams = ({ name, symbol, deployer }: Params) => {
  return ethers.utils.defaultAbiCoder.encode(["string", "string", "address"], [name, symbol, deployer]);
};
