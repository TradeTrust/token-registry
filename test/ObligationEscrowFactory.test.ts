import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  ObligationEscrow,
  ObligationEscrowFactory,
  ObligationEscrowFactoryCallerMock,
} from "@tradetrust/contracts";
import { ContractTransactionResponse, TransactionReceipt } from "ethers";
import faker from "faker";
import { ethers } from "hardhat";
import { expect } from ".";
import { contractInterfaceId, defaultAddress } from "../src/constants";
import { computeObligationEscrowAddress, getEventFromReceipt } from "../src/utils";
import { deployObligationEscrowFactoryFixture } from "./fixtures";
import { createDeployFixtureRunner, getTestUsers, TestUsers, txnHexRemarks } from "./helpers";

describe("ObligationEscrowFactory", async () => {
  let users: TestUsers;

  let obligationEscrowFactory: ObligationEscrowFactory;

  let deployFixturesRunner: () => Promise<[ObligationEscrowFactory]>;

  // eslint-disable-next-line no-undef
  before(async () => {
    users = await getTestUsers();

    deployFixturesRunner = async () =>
      createDeployFixtureRunner(deployObligationEscrowFactoryFixture({ deployer: users.carrier }));
  });

  beforeEach(async () => {
    [obligationEscrowFactory] = await loadFixture(deployFixturesRunner);
  });

  describe("Implementation", () => {
    let implAddr: string;
    let obligationEscrowContract: ObligationEscrow;

    beforeEach(async () => {
      implAddr = await obligationEscrowFactory.implementation();
      obligationEscrowContract = (await ethers.getContractFactory("ObligationEscrow")).attach(
        implAddr
      ) as unknown as ObligationEscrow;
    });

    it("should have an implementation", async () => {
      expect(implAddr).to.not.equal(defaultAddress.Zero);
    });

    it("should have the correct obligation escrow implementation", async () => {
      const interfaceId = contractInterfaceId.ObligationEscrow;

      const res = await obligationEscrowContract.supportsInterface(interfaceId);

      expect(res).to.be.true;
    });

    it("should have zero-value storage on the raw implementation", async () => {
      const [registry, beneficiary, holder, tokenId] = await Promise.all([
        obligationEscrowContract.registry(),
        obligationEscrowContract.beneficiary(),
        obligationEscrowContract.holder(),
        obligationEscrowContract.tokenId(),
      ]);

      expect(registry).to.equal(defaultAddress.Zero);
      expect(beneficiary).to.equal(defaultAddress.Zero);
      expect(holder).to.equal(defaultAddress.Zero);
      expect(tokenId).to.equal(ethers.ZeroHash);
    });

    it("should not allow initialising implementation externally", async () => {
      const [punk] = users.others;
      const badAddress = faker.finance.ethereumAddress();

      const tx = obligationEscrowContract.connect(punk).initialize(badAddress, "123");

      await expect(tx).to.be.revertedWithCustomError(obligationEscrowContract, "InvalidInitialization");
    });

    it("should not allow calling shred on implementation", async () => {
      const [punk] = users.others;

      const tx = obligationEscrowContract.connect(punk).shred(txnHexRemarks.burnRemark);

      await expect(tx).to.be.reverted;
    });
  });

  describe("Create Obligation Escrow Contract", () => {
    let tokenId: string;
    let obligationEscrowFactoryCallerMock: ObligationEscrowFactoryCallerMock;

    beforeEach(async () => {
      tokenId = faker.datatype.hexaDecimal(64);

      obligationEscrowFactoryCallerMock = (await (
        await ethers.getContractFactory("ObligationEscrowFactoryCallerMock")
      ).deploy()) as unknown as ObligationEscrowFactoryCallerMock;
    });

    describe("Create Caller", () => {
      it("should revert when calls create from an EOA", async () => {
        const [eoa] = users.others;

        const tx = obligationEscrowFactory.connect(eoa).create(tokenId);

        await expect(tx).to.be.revertedWithCustomError(obligationEscrowFactory, "CreateCallerNotContract");
      });

      it("should call create successfully from a contract", async () => {
        const tx = obligationEscrowFactoryCallerMock
          .connect(users.carrier)
          .callCreate(obligationEscrowFactory.target, tokenId);

        await expect(tx).to.not.be.reverted;
      });
    });

    describe("Create Obligation Escrow Behaviours", () => {
      let obligationEscrowFactoryCreateTx: ContractTransactionResponse;
      let obligationEscrowContract: ObligationEscrow;

      beforeEach(async () => {
        const [signer] = users.others;
        obligationEscrowFactoryCreateTx = await obligationEscrowFactoryCallerMock
          .connect(signer)
          .callCreate(obligationEscrowFactory.target, tokenId);
        const obligationEscrowAddress = getEventFromReceipt<any>(
          (await obligationEscrowFactoryCreateTx.wait()) as TransactionReceipt,
          "ObligationEscrowCreated",
          obligationEscrowFactory.interface
        ).args.titleEscrow;
        obligationEscrowContract = (await ethers.getContractFactory("ObligationEscrow")).attach(
          obligationEscrowAddress
        ) as unknown as ObligationEscrow;
      });

      it("should create with the correct token registry address", async () => {
        const registryAddress = await obligationEscrowContract.registry();
        const createCallerAddress = obligationEscrowFactoryCallerMock.target;

        expect(registryAddress).to.equal(createCallerAddress);
      });

      it("should emit ObligationEscrowCreated event", async () => {
        const createCallerAddress = obligationEscrowFactoryCallerMock.target;

        await expect(obligationEscrowFactoryCreateTx)
          .to.emit(obligationEscrowFactory, "ObligationEscrowCreated")
          .withArgs(obligationEscrowContract.target, createCallerAddress, tokenId);
      });
    });
  });

  describe("Compute Obligation Escrow address", () => {
    it("should return the correct obligation escrow address", async () => {
      const fakeRegistryAddress = faker.finance.ethereumAddress();
      const tokenId = faker.datatype.hexaDecimal(64);
      const implementationAddress = await obligationEscrowFactory.implementation();

      const expectedAddress = computeObligationEscrowAddress({
        implementationAddress,
        registryAddress: fakeRegistryAddress,
        tokenId,
        factoryAddress: obligationEscrowFactory.target as string,
      });

      const res = await obligationEscrowFactory.getEscrowAddress(fakeRegistryAddress, tokenId);

      expect(res).to.equal(expectedAddress);
    });

    it("should return different addresses for different token IDs", async () => {
      const fakeRegistryAddress = faker.finance.ethereumAddress();
      const tokenIdA = faker.datatype.hexaDecimal(64);
      const tokenIdB = faker.datatype.hexaDecimal(64);

      const addrA = await obligationEscrowFactory.getEscrowAddress(fakeRegistryAddress, tokenIdA);
      const addrB = await obligationEscrowFactory.getEscrowAddress(fakeRegistryAddress, tokenIdB);

      expect(addrA).to.not.equal(addrB);
    });

    it("should return different addresses for different registries", async () => {
      const tokenId = faker.datatype.hexaDecimal(64);
      const registryA = faker.finance.ethereumAddress();
      const registryB = faker.finance.ethereumAddress();

      const addrA = await obligationEscrowFactory.getEscrowAddress(registryA, tokenId);
      const addrB = await obligationEscrowFactory.getEscrowAddress(registryB, tokenId);

      expect(addrA).to.not.equal(addrB);
    });
  });
});
