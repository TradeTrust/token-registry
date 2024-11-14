import { ethers } from "ethers";

export interface Params {
  name: string;
  symbol: string;
  deployer: string;
}

if (ethers.version.includes("/5")) {
  (ethers as any).AbiCoder = {
    defaultAbiCoder: () => (ethers as any).utils.defaultAbiCoder
  }
}

export const encodeInitParams = ({ name, symbol, deployer }: Params) => {
  return ethers.AbiCoder.defaultAbiCoder().encode(["string", "string", "address"], [name, symbol, deployer]);
};
