import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { TDocDeployer, TradeTrustTokenStandard } from "@tradetrust/contracts";
import { ContractTransaction, TransactionReceipt } from "ethers";
import faker from "faker";
import { ethers } from "hardhat";
import { expect } from ".";
import { contractInterfaceId, defaultAddress } from "../src/constants";
import { encodeInitParams, getEventFromReceipt } from "../src/utils";
import { deployTDocDeployerFixture, deployTradeTrustTokenStandardFixture } from "./fixtures";
import { createDeployFixtureRunner, getTestUsers, TestUsers } from "./helpers";

describe("TDocDeployer", async () => {
  let users: TestUsers;
  let deployer: SignerWithAddress;

  let deployerContract: TDocDeployer;
  let implContract: TradeTrustTokenStandard;
  let fakeTitleEscrowFactory: string;
  let implContractAddress: string;

  let deployerContractAsOwner: TDocDeployer;
  let deployerContractAsNonOwner: TDocDeployer;

  let deployFixturesRunner: () => Promise<[TradeTrustTokenStandard, TDocDeployer]>;

  // eslint-disable-next-line no-undef
  before(async () => {
    users = await getTestUsers();
    deployer = users.carrier;

    deployFixturesRunner = async () =>
      createDeployFixtureRunner(
        deployTradeTrustTokenStandardFixture({ deployer }),
        deployTDocDeployerFixture({ deployer })
      );
  });

  beforeEach(async () => {
    fakeTitleEscrowFactory = ethers.getAddress(faker.finance.ethereumAddress());

    [implContract, deployerContract] = await loadFixture(deployFixturesRunner);
    implContractAddress = await implContract.getAddress();

    deployerContractAsOwner = deployerContract.connect(deployer);
    deployerContractAsNonOwner = deployerContract.connect(users.beneficiary);
  });

  describe("Deployer Implementation", () => {
    let deployerImpl: TDocDeployer;

    beforeEach(async () => {
      deployerImpl = (await (await ethers.getContractFactory("TDocDeployer"))
        .connect(deployer)
        .deploy()) as unknown as TDocDeployer;
    });

    it("should initialise deployer implementation", async () => {
      const tx = deployerImpl.initialize();

      await expect(tx).to.be.revertedWithCustomError(deployerImpl, "InvalidInitialization");
    });

    it("should have zero address as owner", async () => {
      const res = await deployerImpl.owner();

      expect(res).to.equal(defaultAddress.Zero);
    });
  });

  describe("Upgrade Deployer", () => {
    let mockDeployerImpl: TDocDeployer;

    beforeEach(async () => {
      mockDeployerImpl = (await (await ethers.getContractFactory("TDocDeployer")).deploy()) as unknown as TDocDeployer;
    });

    it("should allow owner to upgrade", async () => {
      const tx = deployerContractAsOwner.upgradeToAndCall(await mockDeployerImpl.getAddress(), "0x");

      await expect(tx).to.not.be.reverted;
    });

    it("should not allow non-owner to upgrade", async () => {
      const tx = deployerContractAsNonOwner.upgradeToAndCall(await mockDeployerImpl.getAddress(), "0x");

      await expect(tx)
        .to.be.revertedWithCustomError(deployerContractAsNonOwner, "OwnableUnauthorizedAccount")
        .withArgs(users.beneficiary.address);
    });
  });

  describe("Implementation Administration", () => {
    it("should have the correct owner", async () => {
      const res = await deployerContract.owner();

      expect(res).to.equal(deployer.address);
    });

    describe("Adding Implementation", () => {
      let addImplementationTx: ContractTransaction;
      beforeEach(async () => {
        addImplementationTx = (await deployerContractAsOwner.addImplementation(
          implContractAddress,
          fakeTitleEscrowFactory
        )) as ContractTransaction;
      });

      it("should add implementation correctly", async () => {
        const res = await deployerContractAsNonOwner.implementations(implContractAddress);

        expect(res).to.equal(fakeTitleEscrowFactory);
      });

      it("should emit AddImplementation when add implementation", async () => {
        await expect(addImplementationTx)
          .to.emit(deployerContract, "AddImplementation")
          .withArgs(implContractAddress, fakeTitleEscrowFactory);
      });

      it("should not allow adding an already added implementation", async () => {
        const tx = deployerContractAsOwner.addImplementation(implContractAddress, fakeTitleEscrowFactory);

        await expect(tx).to.be.revertedWithCustomError(deployerContractAsNonOwner, "ImplementationAlreadyAdded");
      });

      it("should not allow non-owner to add implementation", async () => {
        const tx = deployerContractAsNonOwner.addImplementation(implContractAddress, fakeTitleEscrowFactory);

        await expect(tx)
          .to.be.revertedWithCustomError(deployerContractAsNonOwner, "OwnableUnauthorizedAccount")
          .withArgs(users.beneficiary.address);
      });
    });

    describe("Removing Implementation", () => {
      it("should remove implementation correctly", async () => {
        await deployerContractAsOwner.addImplementation(implContractAddress, fakeTitleEscrowFactory);
        const initialRes = await deployerContract.implementations(implContractAddress);

        await deployerContractAsOwner.removeImplementation(implContractAddress);
        const currentRes = await deployerContract.implementations(implContractAddress);

        expect(initialRes).to.equal(fakeTitleEscrowFactory);
        expect(currentRes).to.equal(defaultAddress.Zero);
      });

      it("should not allow non-owner to remove implementation", async () => {
        const tx = deployerContractAsNonOwner.removeImplementation(implContractAddress);

        await expect(tx)
          .to.be.revertedWithCustomError(deployerContractAsNonOwner, "OwnableUnauthorizedAccount")
          .withArgs(users.beneficiary.address);
      });

      it("should not allow removing an invalid implementation", async () => {
        const fakeImplContract = faker.finance.ethereumAddress();

        const tx = deployerContractAsOwner.removeImplementation(fakeImplContract);

        await expect(tx).to.be.revertedWithCustomError(deployerContractAsNonOwner, "InvalidImplementation");
      });
    });
  });

  describe("Deployment Behaviours", () => {
    let fakeTokenName: string;
    let fakeTokenSymbol: string;
    let registryAdmin: SignerWithAddress;

    beforeEach(async () => {
      fakeTokenName = "The Great Shipping Co.";
      fakeTokenSymbol = "GSC";
      registryAdmin = users.others[faker.datatype.number(users.others.length - 1)];

      await deployerContractAsOwner.addImplementation(implContractAddress, fakeTitleEscrowFactory);
    });

    it("should not allow non-whitelisted implementations", async () => {
      const fakeAddress = faker.finance.ethereumAddress();
      const initParams = encodeInitParams({
        name: fakeTokenName,
        symbol: fakeTokenSymbol,
        deployer: registryAdmin.address,
      });
      const tx = deployerContractAsNonOwner.deploy(fakeAddress, initParams);

      await expect(tx).to.be.revertedWithCustomError(
        deployerContractAsNonOwner,
        "UnsupportedImplementationContractAddress"
      );
    });

    it("should revert when registry admin is zero address", async () => {
      const initParams = encodeInitParams({
        name: fakeTokenName,
        symbol: fakeTokenSymbol,
        deployer: defaultAddress.Zero,
      });
      const tx = deployerContractAsNonOwner.deploy(implContractAddress, initParams);

      await expect(tx).to.be.revertedWithCustomError(deployerContractAsNonOwner, "ImplementationInitializationFailure");
    });

    describe("Deploy", () => {
      let createTx: ContractTransaction;
      let clonedRegistryContract: TradeTrustTokenStandard;
      let initParams: string;

      beforeEach(async () => {
        initParams = encodeInitParams({
          name: fakeTokenName,
          symbol: fakeTokenSymbol,
          deployer: await registryAdmin.getAddress(),
        });
        const tx = await deployerContractAsNonOwner.deploy(implContractAddress, initParams);
        createTx = tx as ContractTransaction;
        const createReceipt = await tx.wait();
        const event = getEventFromReceipt<any>(
          createReceipt as unknown as TransactionReceipt,
          "Deployment",
          deployerContract.interface
        );

        clonedRegistryContract = (await ethers.getContractFactory("TradeTrustTokenStandard")).attach(
          event.args.deployed
        ) as unknown as TradeTrustTokenStandard;
      });

      describe("Initialisation by deployer", () => {
        it("should initialise token name", async () => {
          const res = await clonedRegistryContract.name();

          expect(res).to.equal(fakeTokenName);
        });

        it("should initialise token symbol", async () => {
          const res = await clonedRegistryContract.symbol();

          expect(res).to.equal(fakeTokenSymbol);
        });

        it("should initialise title escrow factory", async () => {
          const res = await clonedRegistryContract.titleEscrowFactory();

          expect(res).to.equal(fakeTitleEscrowFactory);
        });

        it("should initialise deployer account as admin", async () => {
          const adminRole = await clonedRegistryContract.DEFAULT_ADMIN_ROLE();
          const res = await clonedRegistryContract.hasRole(adminRole, registryAdmin.address);

          expect(res).to.be.true;
        });

        it("should not set deployer contract as admin", async () => {
          const adminRole = await clonedRegistryContract.DEFAULT_ADMIN_ROLE();
          const res = await clonedRegistryContract.hasRole(adminRole, deployerContract.target);

          expect(res).to.be.false;
        });
      });

      it("should emit Deployment event", async () => {
        await expect(createTx)
          .to.emit(deployerContract, "Deployment")
          .withArgs(
            clonedRegistryContract.target,
            implContractAddress,
            users.beneficiary.address,
            fakeTitleEscrowFactory,
            initParams
          );
      });

      describe("Clone TradeTrustTokenStandard with key interfaces", () => {
        it("should support ITradeTrustTokenMintable", async () => {
          const interfaceId = contractInterfaceId.TradeTrustTokenMintable;

          const res = await clonedRegistryContract.supportsInterface(interfaceId);

          expect(res).to.be.true;
        });

        it("should support ITradeTrustTokenBurnable", async () => {
          const interfaceId = contractInterfaceId.TradeTrustTokenBurnable;

          const res = await clonedRegistryContract.supportsInterface(interfaceId);

          expect(res).to.be.true;
        });

        it("should support ITradeTrustTokenRestorable", async () => {
          const interfaceId = contractInterfaceId.TradeTrustTokenRestorable;

          const res = await clonedRegistryContract.supportsInterface(interfaceId);

          expect(res).to.be.true;
        });

        it("should support the SBT interface", async () => {
          const interfaceId = contractInterfaceId.SBT;

          const res = await clonedRegistryContract.supportsInterface(interfaceId);

          expect(res).to.be.true;
        });
      });
    });
  });
});
