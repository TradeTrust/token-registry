import { TitleEscrowFactory } from "@tradetrust/contracts";
import { Contract } from "ethers";
import { task } from "hardhat/config";
import { deployContract, verifyContract, wait } from "./helpers";
import { TASK_DEPLOY_ESCROW_FACTORY } from "./task-names";

task(TASK_DEPLOY_ESCROW_FACTORY)
  .setDescription("Deploys a new Title Escrow factory")
  .addFlag("verify", "Verify on Etherscan")
  .setAction(async ({ verify }, hre) => {
    const { ethers } = hre;
    try {
      const [deployer] = await ethers.getSigners();
      const deployerAddress = await deployer.getAddress();

      console.log(`[Deployer] ${deployerAddress}`);

      const titleEscrowFactoryContract = await deployContract<TitleEscrowFactory & Contract>({
        params: [],
        contractName: "TitleEscrowFactory",
        hre,
      });
      const factoryDeployTx = titleEscrowFactoryContract.deploymentTransaction();
      console.log(`[Transaction] Pending ${factoryDeployTx?.hash}`);
      await titleEscrowFactoryContract.deploymentTransaction();
      const factoryAddress = titleEscrowFactoryContract.target;
      console.log(`[Status] Deployed to ${factoryAddress}`);

      if (verify) {
        console.log("[Status] Waiting to verify (about a minute)...");
        const [implAddr] = await Promise.all([titleEscrowFactoryContract.implementation(), wait(60000)]);
        console.log("[Status] Start verification");

        await verifyContract({
          address: implAddr,
          constructorArgsParams: [],
          contract: "contracts/TitleEscrow.sol:TitleEscrow",
          hre,
        });

        await verifyContract({
          address: factoryAddress as string,
          constructorArgsParams: [],
          contract: "contracts/TitleEscrowFactory.sol:TitleEscrowFactory",
          hre,
        });
      }

      console.log(`[Status] ✅ Completed deploying Title Escrow Factory at ${factoryAddress}`);
    } catch (err: any) {
      console.log("[Status] ❌ An error occurred while deploying Title Escrow Factory");
      console.error(err.error?.message ?? err.message);
    }
  });
