import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { TitleEscrow, TitleEscrowFactory, TitleEscrowFactoryCallerMock } from "@tradetrust/contracts";
import { ContractTransactionResponse, TransactionReceipt } from "ethers";
import faker from "faker";
import { ethers } from "hardhat";
import { expect } from ".";
import { contractInterfaceId, defaultAddress } from "../src/constants";
import { computeTitleEscrowAddress, getEventFromReceipt } from "../src/utils";
import { deployEscrowFactoryFixture } from "./fixtures";
import { createDeployFixtureRunner, getTestUsers, TestUsers, txnHexRemarks } from "./helpers";

describe("TitleEscrowFactory", async () => {
  let users: TestUsers;

  let titleEscrowFactory: TitleEscrowFactory;

  let deployFixturesRunner: () => Promise<[TitleEscrowFactory]>;

  // eslint-disable-next-line no-undef
  before(async () => {
    users = await getTestUsers();

    deployFixturesRunner = async () =>
      createDeployFixtureRunner(deployEscrowFactoryFixture({ deployer: users.carrier }));
  });

  beforeEach(async () => {
    [titleEscrowFactory] = await loadFixture(deployFixturesRunner);
  });

  describe("Implementation", () => {
    let implAddr: string;
    let titleEscrowContract: TitleEscrow;

    beforeEach(async () => {
      implAddr = await titleEscrowFactory.implementation();
      titleEscrowContract = (await ethers.getContractFactory("TitleEscrow")).attach(implAddr) as unknown as TitleEscrow;
    });

    it("should have an implementation", async () => {
      expect(implAddr).to.not.equal(defaultAddress.Zero);
    });

    it("should have the correct title escrow implementation", async () => {
      const interfaceId = contractInterfaceId.TitleEscrow;

      const res = await titleEscrowContract.supportsInterface(interfaceId);

      expect(res).to.be.true;
    });

    it("should initialise implementation", async () => {
      const zeroAddress = defaultAddress.Zero;
      const [registry, beneficiary, holder, tokenId] = await Promise.all([
        titleEscrowContract.registry(),
        titleEscrowContract.beneficiary(),
        titleEscrowContract.holder(),
        titleEscrowContract.tokenId(),
      ]);

      expect(registry).to.equal(zeroAddress);
      expect(beneficiary).to.equal(zeroAddress);
      expect(holder).to.equal(zeroAddress);
      expect(tokenId).to.equal(ethers.ZeroHash);
    });

    it("should not allow initialising implementation externally", async () => {
      const punk = users.others[faker.datatype.number(users.others.length - 1)];
      const badAddress = faker.finance.ethereumAddress();

      const tx = titleEscrowContract.connect(punk).initialize(badAddress, "123");

      await expect(tx).to.be.revertedWithCustomError(titleEscrowContract, "InvalidInitialization");
    });

    it("should not allow calling shred on implementation", async () => {
      const punk = users.others[faker.datatype.number(users.others.length - 1)];

      const tx = titleEscrowContract.connect(punk).shred(txnHexRemarks.burnRemark);

      await expect(tx).to.be.reverted;
    });
  });

  describe("Create Title Escrow Contract", () => {
    let tokenId: string;
    let titleEscrowFactoryCallerMock: TitleEscrowFactoryCallerMock;

    beforeEach(async () => {
      tokenId = faker.datatype.hexaDecimal(64);

      titleEscrowFactoryCallerMock = (await (
        await ethers.getContractFactory("TitleEscrowFactoryCallerMock")
      ).deploy()) as unknown as TitleEscrowFactoryCallerMock;
    });

    describe("Create Caller", () => {
      it("should revert when calls create from an EOA", async () => {
        const eoa = users.others[faker.datatype.number(users.others.length - 1)];

        const tx = titleEscrowFactory.connect(eoa).create(tokenId);

        await expect(tx).to.be.revertedWithCustomError(titleEscrowFactory, "CreateCallerNotContract");
      });

      it("should call create successfully from a contract", async () => {
        const tx = titleEscrowFactoryCallerMock.connect(users.carrier).callCreate(titleEscrowFactory.target, tokenId);

        await expect(tx).to.not.be.reverted;
      });
    });

    describe("Create Title Escrow Behaviours", () => {
      let titleEscrowFactoryCreateTx: ContractTransactionResponse;
      let titleEscrowContract: TitleEscrow;

      beforeEach(async () => {
        const signer = users.others[faker.datatype.number(users.others.length - 1)];
        titleEscrowFactoryCreateTx = await titleEscrowFactoryCallerMock
          .connect(signer)
          .callCreate(titleEscrowFactory.target, tokenId);
        const titleEscrowAddress = getEventFromReceipt<any>(
          (await titleEscrowFactoryCreateTx.wait()) as TransactionReceipt,
          "TitleEscrowCreated",
          titleEscrowFactory.interface
        ).args.titleEscrow;
        titleEscrowContract = (await ethers.getContractFactory("TitleEscrow")).attach(
          titleEscrowAddress
        ) as unknown as TitleEscrow;
      });

      it("should create with the correct token registry address", async () => {
        const registryAddress = await titleEscrowContract.registry();
        const createCallerAddress = titleEscrowFactoryCallerMock.target;

        expect(registryAddress).to.equal(createCallerAddress);
      });

      it("should emit TitleEscrowCreated event", async () => {
        const createCallerAddress = titleEscrowFactoryCallerMock.target;

        await expect(titleEscrowFactoryCreateTx)
          .to.emit(titleEscrowFactory, "TitleEscrowCreated")
          .withArgs(titleEscrowContract.target, createCallerAddress, tokenId);
      });
    });
  });

  describe("Compute Title Escrow address", () => {
    it("should return the correct title escrow address", async () => {
      const fakeRegistryAddress = faker.finance.ethereumAddress();
      const tokenId = faker.datatype.hexaDecimal(64);
      const implementationAddr = await titleEscrowFactory.implementation();

      const expectedAddress = computeTitleEscrowAddress({
        registryAddress: fakeRegistryAddress,
        tokenId,
        implementationAddress: implementationAddr,
        factoryAddress: titleEscrowFactory.target as string,
      });

      const res = await (titleEscrowFactory as TitleEscrowFactory).getEscrowAddress(fakeRegistryAddress, tokenId);

      expect(res).to.equal(expectedAddress);
    });
  });
});
