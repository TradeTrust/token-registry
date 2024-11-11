import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";

export type TestUsers = {
  carrier: SignerWithAddress;
  beneficiary: SignerWithAddress;
  holder: SignerWithAddress;
  others: SignerWithAddress[];
};

export const getTestUsers = async () => {
  const [carrier, beneficiary, holder, ...others] = await ethers.getSigners();
  const users: TestUsers = { carrier, beneficiary, holder, others };
  return users;
};
