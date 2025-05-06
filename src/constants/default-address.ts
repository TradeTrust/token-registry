import { ethers as packedEthers } from "ethers";

const ethers = { ...packedEthers };

if (ethers.version.includes("/5")) {
  (ethers as any).ZeroAddress = (ethers as any)?.constants?.AddressZero;
}

export const defaultAddress = {
  Zero: (ethers as any).ZeroAddress,
  Burn: "0x000000000000000000000000000000000000dEaD",
};
