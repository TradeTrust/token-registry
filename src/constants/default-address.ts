import { ethers as packedEthers } from "ethers";

const ethers = { ...packedEthers };

if (ethers.version.startsWith("6.")) {
  (ethers as any).constants = {
    AddressZero: (ethers as any)?.ZeroAddress,
  };
}

export const defaultAddress = {
  Zero: ethers.constants.AddressZero,
  Burn: "0x000000000000000000000000000000000000dEaD",
};
