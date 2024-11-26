import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { TDocDeployer } from "@tradetrust/contracts";
import { ethers } from "hardhat";
import ERC1967Proxy from "./artifacts/ERC1967Proxy.json";

export const deployTDocDeployerFixture = async ({ deployer }: { deployer: SignerWithAddress }) => {
  const impl = (await (await ethers.getContractFactory("TDocDeployer"))
    .connect(deployer)
    .deploy()) as unknown as TDocDeployer;
  const proxyImpl = await (
    await ethers.getContractFactory(ERC1967Proxy.abi, ERC1967Proxy.data.bytecode.object, deployer)
  ).deploy(await impl.getAddress(), "0x8129fc1c");

  return (await ethers.getContractFactory("TDocDeployer")).attach(
    await proxyImpl.getAddress()
  ) as unknown as TDocDeployer;
};
