import { SimpleCaller, TitleEscrow, TitleEscrowFactory, TradeTrustToken } from "@tradetrust/contracts";
import { LogDescription } from "ethers";
import faker from "faker";
import { ethers } from "hardhat";
import { expect } from ".";
import { contractInterfaceId, defaultAddress } from "../src/constants";
import { computeTitleEscrowAddress } from "../src/utils";
import { deployTokenFixture } from "./fixtures";
import { getTestUsers, getTitleEscrowContract, remarkString, TestUsers, txnHexRemarks } from "./helpers";

describe("TradeTrustTokenMintable", async () => {
  let users: TestUsers;
  let registryContract: TradeTrustToken;

  let registryName: string;
  let registrySymbol: string;

  let registryContractAsAdmin: TradeTrustToken;

  let mockTitleEscrowFactoryContract: TitleEscrowFactory;

  let tokenId: string;
  let titleEscrowImplAddr: string;
  let titleEscrowContract: TitleEscrow;

  let deployMockTitleEscrowAndTokenFixtureRunner: () => Promise<[TitleEscrowFactory, TradeTrustToken]>;

  // eslint-disable-next-line no-undef
  before(async () => {
    users = await getTestUsers();

    registryName = "The Great Shipping Company";
    registrySymbol = "GSC";

    deployMockTitleEscrowAndTokenFixtureRunner = async () => {
      const mockTitleEscrowFactoryContractFixture = (await (
        await ethers.getContractFactory("TitleEscrowFactory")
      ).deploy()) as unknown as TitleEscrowFactory;

      const [, registryContractFixture] = await deployTokenFixture<TradeTrustToken>({
        tokenContractName: "TradeTrustToken",
        tokenName: registryName,
        tokenInitials: registrySymbol,
        escrowFactoryAddress: mockTitleEscrowFactoryContractFixture.target as string,
        deployer: users.carrier,
      });

      return [mockTitleEscrowFactoryContractFixture, registryContractFixture];
    };
  });

  beforeEach(async () => {
    tokenId = faker.datatype.hexaDecimal(64);

    // Fixtures need to be redeployed here without loadFixture because snapshot does not reset call counts in mocks
    // Only this section has tests that test for call counts
    [mockTitleEscrowFactoryContract, registryContract] = await deployMockTitleEscrowAndTokenFixtureRunner();

    registryContractAsAdmin = registryContract.connect(users.carrier);
    titleEscrowImplAddr = await mockTitleEscrowFactoryContract.implementation();
  });

  describe("Mint", () => {
    beforeEach(async () => {
      await registryContractAsAdmin.mint(
        users.beneficiary.address,
        users.beneficiary.address,
        tokenId,
        txnHexRemarks.mintRemark
      );
      titleEscrowContract = await getTitleEscrowContract(registryContract, tokenId);
    });

    it("should mint token to a title escrow", async () => {
      const interfaceId = contractInterfaceId.TitleEscrow;

      const res = await titleEscrowContract.supportsInterface(interfaceId);

      expect(res).to.be.true;
    });

    it("should support ITradeTrustTokenMintable", async () => {
      const interfaceId = contractInterfaceId.TradeTrustTokenMintable;

      const res = await registryContract.supportsInterface(interfaceId);

      expect(res).to.be.true;
    });

    it("should mint token to a correct title escrow address", async () => {
      const expectedTitleEscrowAddr = computeTitleEscrowAddress({
        tokenId,
        registryAddress: registryContract.target as string,
        implementationAddress: titleEscrowImplAddr,
        factoryAddress: mockTitleEscrowFactoryContract.target as string,
      });

      const res = await registryContract.ownerOf(tokenId);

      expect(res).to.equal(expectedTitleEscrowAddr);
    });

    it("should not allow minting a token that has been burnt", async () => {
      await titleEscrowContract.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);
      await registryContractAsAdmin.burn(tokenId, txnHexRemarks.burnRemark);

      const tx = registryContractAsAdmin.mint(
        users.beneficiary.address,
        users.beneficiary.address,
        tokenId,
        txnHexRemarks.mintRemark
      );

      await expect(tx).to.be.revertedWithCustomError(registryContractAsAdmin, "TokenExists");
    });

    it("should not allow minting an existing token", async () => {
      const tx = registryContractAsAdmin.mint(
        users.beneficiary.address,
        users.beneficiary.address,
        tokenId,
        txnHexRemarks.mintRemark
      );

      await expect(tx).to.be.revertedWithCustomError(registryContractAsAdmin, "TokenExists");
    });

    it("should create title escrow from factory", async () => {
      const simpleCallerMock = (await (
        await ethers.getContractFactory("SimpleCaller")
      ).deploy()) as unknown as SimpleCaller;

      const data = mockTitleEscrowFactoryContract.interface.encodeFunctionData("create", [tokenId]);
      const tx = await simpleCallerMock.callFunction(mockTitleEscrowFactoryContract.target, data);

      const receipt = await tx.wait();
      const logs = receipt?.logs;

      let escrowEventName: string = "";
      let logsFound = 0;
      logs?.some((log) => {
        try {
          const decoded: LogDescription | null = mockTitleEscrowFactoryContract.interface.parseLog(log);
          if (decoded) logsFound += 1;
          if (decoded?.name === "TitleEscrowCreated") {
            escrowEventName = decoded.name;
            return true;
          }
        } catch (e) {
          return false;
        }
        return false;
      });
      expect(logsFound).to.equal(1);
      expect(escrowEventName).to.equal("TitleEscrowCreated");
    });

    it("should create title escrow with correct token ID", async () => {
      const simpleCallerMock = (await (
        await ethers.getContractFactory("SimpleCaller")
      ).deploy()) as unknown as SimpleCaller;
      const data = mockTitleEscrowFactoryContract.interface.encodeFunctionData("create", [tokenId]);
      const tx = await simpleCallerMock.callFunction(mockTitleEscrowFactoryContract.target, data);
      const receipt: any = await tx.wait();
      const decoded = mockTitleEscrowFactoryContract.interface.parseLog(receipt.logs[1]);
      expect(ethers.toBeHex(decoded?.args.tokenId)).to.equal(tokenId.toLowerCase());
    });

    it("should emit Transfer event with correct values", async () => {
      tokenId = faker.datatype.hexaDecimal(64);
      const tx = await registryContractAsAdmin.mint(
        users.beneficiary.address,
        users.holder.address,
        tokenId,
        txnHexRemarks.mintRemark
      );
      titleEscrowContract = await getTitleEscrowContract(registryContract, tokenId);

      await expect(tx)
        .to.emit(registryContract, "Transfer")
        .withArgs(defaultAddress.Zero, titleEscrowContract.target, tokenId);
    });

    describe("Mint with correct beneficiary , holder and remark", () => {
      beforeEach(async () => {
        tokenId = faker.datatype.hexaDecimal(64);
        await registryContractAsAdmin.mint(
          users.beneficiary.address,
          users.holder.address,
          tokenId,
          txnHexRemarks.mintRemark
        );
        titleEscrowContract = await getTitleEscrowContract(registryContract, tokenId);
      });

      it("should create title escrow with the correct beneficiary", async () => {
        const beneficiary = await titleEscrowContract.beneficiary();

        expect(beneficiary).to.equal(users.beneficiary.address);
      });

      it("should create title escrow with the correct holder", async () => {
        const holder = await titleEscrowContract.holder();

        expect(holder).to.equal(users.holder.address);
      });
      it("should create title escrow with the correct remark", async () => {
        const remark = await titleEscrowContract.remark();

        expect(remark).to.equal(txnHexRemarks.mintRemark);

        // convert the hex string to utf8 and compare
        expect(ethers.toUtf8String(remark)).to.equal(remarkString.mintRemark);
      });
    });
  });
});
