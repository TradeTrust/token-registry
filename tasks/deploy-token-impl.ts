import { TDocDeployer, TradeTrustTokenStandard } from "@tradetrust/contracts";
import { Contract } from "ethers";
import { task } from "hardhat/config";
import { constants } from "../src";
import { deployContract, verifyContract, wait } from "./helpers";
import {
  TASK_ADD_TOKEN_IMPL,
  TASK_DEPLOY_TDOCDEPLOYER,
  TASK_DEPLOY_TOKEN_IMPL,
  TASK_REMOVE_TOKEN_IMPL,
} from "./task-names";

task(TASK_DEPLOY_TOKEN_IMPL)
  .setDescription("Deploys the token implementation contract")
  .addFlag("verify", "Verify on Etherscan")
  .setAction(async ({ verify }, hre) => {
    const { ethers } = hre;
    try {
      const [deployer] = await ethers.getSigners();
      const deployerAddress = await deployer.getAddress();

      console.log(`[Deployer] ${deployerAddress}`);

      const registryImplContract = await deployContract<TradeTrustTokenStandard & Contract>({
        params: [],
        contractName: "TradeTrustTokenStandard",
        hre,
      });

      if (verify) {
        console.log("[Status] Waiting to verify (about a minute)...");
        await wait(60000);
        console.log("[Status] Start verification");

        await verifyContract({
          address: registryImplContract.target as string,
          constructorArgsParams: [],
          contract: "contracts/presets/TradeTrustTokenStandard.sol:TradeTrustTokenStandard",
          hre,
        });
      }

      console.log(`[Status] ✅ Completed deploying token implementation at ${registryImplContract.target}`);
    } catch (err: any) {
      console.log("[Status] ❌ An error occurred while deploying token implementation");
      console.error(err.error?.message ?? err.message);
    }
  });

task(TASK_ADD_TOKEN_IMPL)
  .setDescription("Adds a new token implementation contract")
  .addOptionalParam("deployer", "Address of TDocDeployer")
  .addOptionalParam("implementation", "Address of token implementation")
  .addOptionalParam("factory", "Address of Title Escrow factory")
  .setAction(
    async ({ deployer: deployerOverride, implementation: implementationOverride, factory: factoryOverride }, hre) => {
      const { ethers, network } = hre;
      const { contractAddress } = constants;
      try {
        const [signer] = await ethers.getSigners();
        const chainId = Number(await signer.provider.getNetwork().then((net) => net.chainId));
        const signerAddress = await signer.getAddress();
        const deployerAddress = deployerOverride ?? contractAddress.Deployer[chainId];
        const implementationAddress = implementationOverride ?? contractAddress.TokenImplementation[chainId];
        const factoryAddress = factoryOverride ?? contractAddress.TitleEscrowFactory[chainId];

        if (!deployerAddress || !implementationAddress || !factoryAddress) {
          throw new Error(
            `Network ${network.name} currently is not supported. Please provide --deployer, --implementation and --factory.`
          );
        }

        console.log(`[Signer] ${signerAddress}`);
        console.log(`[Deployer] ${deployerAddress}`);
        console.log(`[Implementation] ${implementationAddress}`);
        console.log(`[Factory] ${factoryAddress}`);

        const deployerContractBase = (await ethers.getContractFactory("TDocDeployer"))
          .attach(deployerAddress)
          .connect(signer);

        const deployerContract = deployerContractBase as unknown as TDocDeployer;
        // Current factory of implementation
        const currentFactory = await deployerContract.implementations(implementationAddress);
        console.log(`[Current Factory] ${currentFactory}`);

        const owner = await deployerContract.owner();
        console.log(`[Owner] ${owner}`);

        const tx = await deployerContract.addImplementation(implementationAddress, factoryAddress);
        console.log(`[Transaction] Pending ${tx.hash}`);
        await tx.wait();

        console.log(`[Status] ✅ Completed adding token implementation at ${deployerAddress}`);
      } catch (err: any) {
        console.log("[Status] ❌ An error occurred while adding token implementation");
        console.error(err.error?.message ?? err.message);
      }
    }
  );

task(TASK_REMOVE_TOKEN_IMPL)
  .setDescription("Removes a token implementation contract")
  .setAction(async (_, hre) => {
    const { ethers } = hre;
    const { contractAddress } = constants;
    try {
      const [signer] = await ethers.getSigners();
      const chainId = Number(await signer.provider.getNetwork().then((net) => net.chainId));
      const signerAddress = await signer.getAddress();
      const deployerAddress = contractAddress.Deployer[chainId];
      const implementationAddress = contractAddress.TokenImplementation[chainId];

      console.log(`[Signer] ${signerAddress}`);
      console.log(`[Deployer] ${deployerAddress}`);
      console.log(`[Implementation] ${implementationAddress}`);

      const deployerContractBase = (await ethers.getContractFactory("TDocDeployer"))
        .attach(deployerAddress)
        .connect(signer);
      const deployerContract = deployerContractBase as unknown as TDocDeployer;
      const tx = await deployerContract.removeImplementation(implementationAddress);
      console.log(`[Transaction] Pending ${tx.hash}`);
      await tx.wait();

      console.log(`[Status] ✅ Completed removing token implementation at ${deployerAddress}`);
    } catch (err: any) {
      console.log("[Status] ❌ An error occurred while removing token implementation");
      console.error(err.error?.message ?? err.message);
    }
  });

task(TASK_DEPLOY_TDOCDEPLOYER)
  .setDescription("Deploys the TDocDeployer contract through an ERC1967 proxy")
  .addFlag("verify", "Verify on Etherscan")
  .setAction(async ({ verify }, hre) => {
    const { ethers, upgrades } = hre;
    try {
      const [deployer] = await ethers.getSigners();
      const deployerAddress = await deployer.getAddress();
      console.log(`[Deployer] ${deployerAddress}`);

      const tdocdeployerFactory = await ethers.getContractFactory("TDocDeployer");
      const tdocdeployerContract = (await upgrades.deployProxy(tdocdeployerFactory, [], {
        kind: "uups",
        initializer: "initialize",
        unsafeAllow: ["constructor", "missing-initializer-call"],
      })) as unknown as TDocDeployer & Contract;
      const proxyTx = tdocdeployerContract.deploymentTransaction();
      console.log(`[Transaction] Pending ${proxyTx?.hash}`);
      await tdocdeployerContract.waitForDeployment();

      const proxyAddress = tdocdeployerContract.target as string;
      const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
      console.log(`[Implementation] ${implementationAddress}`);
      console.log(`[Proxy] ${proxyAddress}`);
      if (verify) {
        console.log("[Status] Waiting to verify (about a minute)...");
        await wait(60000);
        console.log("[Status] Start verification");

        await verifyContract({
          address: implementationAddress,
          constructorArgsParams: [],
          contract: "contracts/utils/TDocDeployer.sol:TDocDeployer",
          hre,
        });
      }

      console.log(`[Status] ✅ Completed deploying TDocDeployer proxy at ${tdocdeployerContract.target}`);
    } catch (err: any) {
      console.log("[Status] ❌ An error occurred while deploying TDocDeployer");
      console.error(err.error?.message ?? err.message);
    }
  });
