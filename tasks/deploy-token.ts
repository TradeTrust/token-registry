// noinspection ExceptionCaughtLocallyJS

import { TDocDeployer, TradeTrustToken } from "@tradetrust/contracts";
import { Contract, TransactionReceipt } from "ethers";
import { task } from "hardhat/config";
import { constants } from "../src";
import { encodeInitParams, getEventFromReceipt } from "../src/utils";
import { deployContract, isSupportedTitleEscrowFactory, verifyContract, wait } from "./helpers";
import { TASK_DEPLOY_TOKEN } from "./task-names";

task(TASK_DEPLOY_TOKEN)
  .setDescription("Deploys the TradeTrust token")
  .addParam("name", "Name of the token")
  .addParam("symbol", "Symbol of token")
  .addFlag("verify", "Verify on Etherscan")
  .addFlag("standalone", "Deploy as standalone token contract")
  .addOptionalParam("factory", "Address of Title Escrow factory (Optional)")
  .setAction(async ({ name, symbol, verify, factory, standalone }, hre) => {
    const { ethers, network } = hre;
    const { contractAddress } = constants;
    try {
      const [deployer] = await ethers.getSigners();
      const deployerAddress = await deployer.getAddress();
      const chainId = Number(await deployer.provider.getNetwork().then((net) => net.chainId));
      let factoryAddress = factory;
      let registryAddress: string;

      if (!chainId) {
        throw new Error(`Invalid chain ID: ${chainId}`);
      }

      console.log(`[Deployer] ${deployerAddress}`);

      if (!factoryAddress) {
        factoryAddress = contractAddress.TitleEscrowFactory[chainId];
        if (!factoryAddress) {
          throw new Error(`Network ${network.name} currently is not supported. Supply a factory address.`);
        }
        console.log(`[Status] Using ${factoryAddress} as Title Escrow factory.`);
      }

      const supportedTitleEscrowFactory = await isSupportedTitleEscrowFactory(factoryAddress, ethers.provider);
      if (!supportedTitleEscrowFactory) {
        throw new Error(`Title Escrow Factory ${factoryAddress} is not supported.`);
      }
      console.log("[Status] Title Escrow Factory interface check is OK.");

      if (!standalone) {
        const deployerContractAddress = contractAddress.Deployer[chainId];
        const implAddress = contractAddress.TokenImplementation[chainId];
        if (!deployerContractAddress || !implAddress) {
          throw new Error(`Network ${network.name} currently is not supported. Use --standalone instead.`);
        }
        const deployerContract = (await ethers.getContractFactory("TDocDeployer")).attach(
          deployerContractAddress
        ) as unknown as TDocDeployer;
        let initParam = encodeInitParams({
          name,
          symbol,
          deployer: deployerAddress,
        });
        const tx = await deployerContract.deploy(implAddress, initParam);
        console.log(`[Transaction] Pending ${tx.hash}`);
        const receipt = await tx.wait();
        registryAddress = getEventFromReceipt<any>(
          receipt as unknown as TransactionReceipt,
          "Deployment",
          deployerContract.interface
        ).args.deployed;
      } else {
        // Standalone deployment
        const contractName = "TradeTrustToken";
        const token = await deployContract<TradeTrustToken & Contract>({
          params: [name, symbol, factoryAddress],
          contractName,
          hre,
        });
        registryAddress = token.target as string;
      }

      if (verify) {
        if (standalone) {
          console.log("[Status] Waiting to verify (about a minute)...");
          await wait(60000);
          console.log("[Status] Start verification");

          await verifyContract({
            address: registryAddress,
            constructorArgsParams: [name, symbol, factoryAddress],
            contract: "contracts/TradeTrustToken.sol:TradeTrustToken",
            hre,
          });
        } else {
          console.log("[Status] Skipped verification, already verified.");
        }
      }

      console.log(`[Status] ✅ Completed deploying token contract at ${registryAddress}`);
    } catch (err: any) {
      console.log("[Status] ❌ An error occurred while deploying token");
      console.error(err.error?.message ?? err.message);
    }
  });
