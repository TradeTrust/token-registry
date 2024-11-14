import { ethers } from "ethers";

if (ethers.version.includes("/5")) {
  ethers.ZeroAddress = (ethers as any)?.constants?.AddressZero
}

export const defaultAddress = {
  Zero: ethers.ZeroAddress,
  Burn: "0x000000000000000000000000000000000000dEaD",
};
