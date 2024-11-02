import { Signer } from "ethers";
import { ethers, network } from "hardhat";

/**
 * Impersonate an account as signer.
 * @param address Address of account to be impersonated
 * @param balance Balance in ethers
 */
export const impersonateAccount = async ({
  address,
  balance = 100,
}: {
  address: string;
  balance?: number;
}): Promise<Signer> => {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });
  const hexBalance = ethers.toBeHex(ethers.parseEther(String(balance)));
  await network.provider.send("hardhat_setBalance", [address, ethers.stripZerosLeft(hexBalance)]);

  return ethers.provider.getSigner(address);
};

export const stopImpersonatingAccount = async ({ address }: { address: string }) => {
  await network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [address],
  });
};
