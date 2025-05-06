import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Contract } from "ethers";

export const deployContract = async <TContract extends Contract>({
  params,
  contractName,
  hre,
}: {
  params: any[];
  contractName: string;
  hre: HardhatRuntimeEnvironment;
}): Promise<TContract> => {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();

  const contractFactory = await ethers.getContractFactory(contractName);
  const contract = (await contractFactory.connect(deployer).deploy(...params)) as TContract;

  const tx = contract.deploymentTransaction();
  console.log(`[Transaction] Pending ${tx?.hash}`);

  await contract.deploymentTransaction();
  console.log(`[Address] Deployed to ${contract.target}`);

  return contract;
};
