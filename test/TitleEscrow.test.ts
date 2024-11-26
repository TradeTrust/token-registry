import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  TitleEscrow,
  TitleEscrowFactoryGetterMock,
  TitleEscrowMock,
  TradeTrustToken,
  TradeTrustTokenMock,
} from "@tradetrust/contracts";
import { Contract, Signer } from "ethers";
import faker from "faker";
import { ethers } from "hardhat";
import { expect } from ".";
import { contractInterfaceId, defaultAddress } from "../src/constants";
import {
  deployTitleEscrowFixture,
  deployTitleEscrowMockFixture,
  deployTokenFixture,
  DeployTokenFixtureRunner,
} from "./fixtures";
import { deployImplProxy } from "./fixtures/deploy-impl-proxy.fixture";
import {
  createDeployFixtureRunner,
  getTestUsers,
  getTitleEscrowContract,
  impersonateAccount,
  TestUsers,
  txnHexRemarks,
} from "./helpers";

describe("Title Escrow", async () => {
  let users: TestUsers;

  let tokenId: string;
  const exceededLengthRemark = ethers.hexlify(ethers.randomBytes(121));

  // eslint-disable-next-line no-undef
  before(async () => {
    users = await getTestUsers();
  });

  beforeEach(async () => {
    tokenId = faker.datatype.hexaDecimal(64);
  });

  describe("ERC165 Support", () => {
    let deployTitleEscrowFixtureRunner: () => Promise<[TitleEscrow]>;

    // eslint-disable-next-line no-undef
    before(async () => {
      deployTitleEscrowFixtureRunner = async () =>
        createDeployFixtureRunner(deployTitleEscrowFixture({ deployer: users.carrier }));
    });

    it("should support ITitleEscrow interface", async () => {
      const interfaceId = contractInterfaceId.TitleEscrow;
      const [titleEscrowContract] = await loadFixture(deployTitleEscrowFixtureRunner);

      const res = await titleEscrowContract.supportsInterface(interfaceId);

      expect(res).to.be.true;
    });
  });

  describe("General Behaviours", () => {
    let deployer: SignerWithAddress;
    let implContract: TitleEscrow;
    let titleEscrowContract: TitleEscrow;
    let registryContract: TradeTrustToken;

    let deployFixturesRunner: () => Promise<[TradeTrustToken, TitleEscrow, TitleEscrow]>;

    // eslint-disable-next-line no-undef
    before(async () => {
      deployer = users.others[users.others.length - 1];

      deployFixturesRunner = async (): Promise<[TradeTrustToken, TitleEscrow, TitleEscrow]> => {
        const [, registryContractFixture] = await deployTokenFixture<TradeTrustToken>({
          tokenContractName: "TradeTrustToken",
          tokenName: "The Great Shipping Company",
          tokenInitials: "GSC",
          deployer: users.carrier,
        });
        const implContractFixture = (await deployTitleEscrowFixture({ deployer })) as unknown as TitleEscrow;
        const titleEscrowContractFixture = await deployImplProxy<TitleEscrow & Contract>({
          implementation: implContractFixture as TitleEscrow & Contract,
          deployer: users.carrier,
        });

        return [registryContractFixture, implContractFixture, titleEscrowContractFixture];
      };
    });

    beforeEach(async () => {
      tokenId = faker.datatype.hexaDecimal(64);

      [registryContract, implContract, titleEscrowContract] = await loadFixture(deployFixturesRunner);
    });

    it("should initialise implementation", async () => {
      const tx = implContract.initialize(defaultAddress.Zero, tokenId);
      await expect(tx).to.be.revertedWithCustomError(implContract, "InvalidInitialization");
    });

    describe("Initialisation", () => {
      let fakeRegistryAddress: string;

      beforeEach(async () => {
        fakeRegistryAddress = ethers.getAddress(faker.finance.ethereumAddress());

        await titleEscrowContract.initialize(fakeRegistryAddress, tokenId);
      });

      it("should be initialised with the correct registry address", async () => {
        expect(await titleEscrowContract.registry()).to.equal(fakeRegistryAddress);
      });

      it("should set active as true", async () => {
        expect(await titleEscrowContract.active()).to.be.true;
      });

      it("should keep beneficiary intact", async () => {
        expect(await titleEscrowContract.beneficiary()).to.equal(defaultAddress.Zero);
      });

      it("should keep holder intact", async () => {
        expect(await titleEscrowContract.holder()).to.equal(defaultAddress.Zero);
      });

      it("should initialise with the correct token ID", async () => {
        expect(await titleEscrowContract.tokenId()).to.equal(tokenId);
      });

      it("should initialise beneficiary nominee with zero", async () => {
        expect(await titleEscrowContract.nominee()).to.equal(defaultAddress.Zero);
      });
    });

    describe("IERC721Receiver Behaviour", () => {
      let fakeAddress: string;
      let fakeRegistry: any;

      beforeEach(async () => {
        // using registry contract as fake registry, no special set state is needed for these tests
        fakeRegistry = registryContract;
        (fakeRegistry as any).wallet = await impersonateAccount({
          address: fakeRegistry.target as string,
        });
        fakeAddress = ethers.getAddress(faker.finance.ethereumAddress());

        await titleEscrowContract.initialize(fakeRegistry.target, tokenId);
      });

      it("should only be able to receive designated token ID", async () => {
        const wrongTokenId = faker.datatype.hexaDecimal(64);

        const tx = titleEscrowContract.onERC721Received(fakeAddress, fakeAddress, wrongTokenId, "0x00");

        await expect(tx).to.be.revertedWithCustomError(titleEscrowContract, "InvalidTokenId").withArgs(wrongTokenId);
      });

      it("should only be able to receive from designated registry", async () => {
        const [, fakeWrongRegistry] = users.others;

        const tx = titleEscrowContract
          .connect(fakeWrongRegistry)
          .onERC721Received(fakeAddress, fakeAddress, tokenId, "0x00");

        await expect(tx)
          .to.be.revertedWithCustomError(titleEscrowContract, "InvalidRegistry")
          .withArgs(fakeWrongRegistry.address);
      });

      describe("onERC721Received Data", () => {
        let data: string;

        beforeEach(async () => {
          data = new ethers.AbiCoder().encode(
            ["address", "address", "bytes"],
            [users.beneficiary.address, users.holder.address, txnHexRemarks.mintRemark]
          );
        });

        describe("Minting Token Receive", () => {
          it("should initialise beneficiary correctly on minting token receive", async () => {
            await titleEscrowContract
              .connect(fakeRegistry.wallet as Signer)
              .onERC721Received(fakeAddress, fakeAddress, tokenId, data);
            const beneficiary = await titleEscrowContract.beneficiary();

            expect(beneficiary).to.equal(users.beneficiary.address);
          });

          it("should initialise holder correctly on minting token receive", async () => {
            await titleEscrowContract
              .connect(fakeRegistry.wallet as Signer)
              .onERC721Received(fakeAddress, fakeAddress, tokenId, data);
            const holder = await titleEscrowContract.holder();

            expect(holder).to.equal(users.holder.address);
          });

          it("should emit TokenReceived event with correct values", async () => {
            const tx = titleEscrowContract
              .connect(fakeRegistry.wallet as Signer)
              .onERC721Received(fakeAddress, fakeAddress, tokenId, data);

            await expect(tx)
              .to.emit(titleEscrowContract, "TokenReceived")
              .withArgs(
                users.beneficiary.address,
                users.holder.address,
                true,
                fakeRegistry.target,
                tokenId,
                txnHexRemarks.mintRemark
              );
          });

          describe("When minting token receive is sent without data", () => {
            it("should revert: Empty data", async () => {
              const tx = titleEscrowContract
                .connect(fakeRegistry.wallet as Signer)
                .onERC721Received(fakeAddress, fakeAddress, tokenId, "0x");

              await expect(tx).to.be.revertedWithCustomError(titleEscrowContract, "EmptyReceivingData");
            });

            it("should revert: Missing data", async () => {
              const tx = titleEscrowContract
                .connect(fakeRegistry.wallet as Signer)
                .onERC721Received(fakeAddress, fakeAddress, tokenId, "0x");

              await expect(tx).to.be.reverted;
            });

            it("should revert: Invalid data", async () => {
              const tx = titleEscrowContract
                .connect(fakeRegistry.wallet as Signer)
                .onERC721Received(fakeAddress, fakeAddress, tokenId, "0xabcd");

              await expect(tx).to.be.reverted;
            });
          });

          it("should revert if receiving beneficiary is zero address", async () => {
            data = new ethers.AbiCoder().encode(
              ["address", "address", "bytes"],
              [defaultAddress.Zero, users.holder.address, txnHexRemarks.mintRemark]
            );

            const tx = titleEscrowContract
              .connect(fakeRegistry.wallet as Signer)
              .onERC721Received(fakeAddress, fakeAddress, tokenId, data);

            await expect(tx)
              .to.be.revertedWithCustomError(titleEscrowContract, "InvalidTokenTransferToZeroAddressOwners")
              .withArgs(defaultAddress.Zero, users.holder.address);
          });

          it("should revert if receiving holder is zero address", async () => {
            data = new ethers.AbiCoder().encode(
              ["address", "address", "bytes"],
              [users.beneficiary.address, defaultAddress.Zero, txnHexRemarks.mintRemark]
            );

            const tx = titleEscrowContract
              .connect(fakeRegistry.wallet as Signer)
              .onERC721Received(fakeAddress, fakeAddress, tokenId, data);

            await expect(tx)
              .to.be.revertedWithCustomError(titleEscrowContract, "InvalidTokenTransferToZeroAddressOwners")
              .withArgs(users.beneficiary.address, defaultAddress.Zero);
          });
        });

        describe("After Minting Token Receive", () => {
          it("should return successfully without data after minting token receive", async () => {
            await titleEscrowContract
              .connect(fakeRegistry.wallet as Signer)
              .onERC721Received(fakeAddress, fakeAddress, tokenId, data);
            const tx = titleEscrowContract
              .connect(fakeRegistry.wallet as Signer)
              .onERC721Received(fakeAddress, fakeAddress, tokenId, "0x");

            await expect(tx).to.not.be.reverted;
          });

          it("should emit TokenReceived event with correct values", async () => {
            await titleEscrowContract
              .connect(fakeRegistry.wallet as Signer)
              .onERC721Received(fakeAddress, fakeAddress, tokenId, data);
            const tx = titleEscrowContract
              .connect(fakeRegistry.wallet as Signer)
              .onERC721Received(fakeAddress, fakeAddress, tokenId, "0x");

            await expect(tx)
              .to.emit(titleEscrowContract, "TokenReceived")
              .withArgs(users.beneficiary.address, users.holder.address, false, fakeRegistry.target, tokenId, "0x");
          });
        });

        describe("Beneficiary and Holder Transfer Events", () => {
          it("should emit BeneficiaryTransfer event", async () => {
            const tx = titleEscrowContract
              .connect(fakeRegistry.wallet as Signer)
              .onERC721Received(fakeAddress, fakeAddress, tokenId, data);

            await expect(tx)
              .to.emit(titleEscrowContract, "BeneficiaryTransfer")
              .withArgs(defaultAddress.Zero, users.beneficiary.address, fakeRegistry.target, tokenId, "0x");
          });

          it("should emit HolderTransfer event", async () => {
            const tx = titleEscrowContract
              .connect(fakeRegistry.wallet as Signer)
              .onERC721Received(fakeAddress, fakeAddress, tokenId, data);

            await expect(tx)
              .to.emit(titleEscrowContract, "HolderTransfer")
              .withArgs(defaultAddress.Zero, users.holder.address, fakeRegistry.target, tokenId, "0x");
          });
        });
      });
    });

    describe("Is Holding Token Status", () => {
      let titleEscrowOwnerContract: TitleEscrow;

      beforeEach(async () => {
        await registryContract
          .connect(users.carrier)
          .mint(users.beneficiary.address, users.beneficiary.address, tokenId, txnHexRemarks.mintRemark);
        titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, tokenId);
      });

      it("should return true when holding token", async () => {
        const res = await titleEscrowOwnerContract.isHoldingToken();

        expect(res).to.be.true;
      });

      it("should return false when not holding token", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        const res = await titleEscrowOwnerContract.isHoldingToken();

        expect(res).to.be.false;
      });
    });

    describe("Active Status", () => {
      it("should return false before being initialised", async () => {
        const res = await titleEscrowContract.active();
        expect(res).to.be.false;
      });

      it("should return true after being initialised", async () => {
        await titleEscrowContract.initialize(registryContract.getAddress(), tokenId);
        const res = await titleEscrowContract.active();
        expect(res).to.be.true;
      });

      describe("When title escrow is not active", () => {
        let fakeAddress: string;
        let mockTitleEscrowContract: TitleEscrowMock;
        beforeEach(async () => {
          fakeAddress = ethers.getAddress(faker.finance.ethereumAddress());
          const deployMockFixtureRunner = async (): Promise<[TitleEscrowMock, TradeTrustTokenMock]> => {
            // Deploying the title escrow factory contract mock to return the title escrow mock correctly
            const titleEscrowFactoryGetterMock = (await (
              await ethers.getContractFactory("TitleEscrowFactoryGetterMock")
            ).deploy()) as unknown as TitleEscrowFactoryGetterMock;

            // Deploy the TradeTrustTokenMock contract to be used as the registry and adding escrow factory address
            const [, registryContractMock] = await deployTokenFixture<TradeTrustTokenMock>({
              tokenContractName: "TradeTrustTokenMock",
              tokenName: "The Great Shipping Company",
              tokenInitials: "GSC",
              deployer: users.carrier,
              escrowFactoryAddress: titleEscrowFactoryGetterMock.target as string,
            });

            // Deploy the Title Escrow mock contract and initialize it with the required parameters
            mockTitleEscrowContract = await deployTitleEscrowMockFixture({ deployer: users.carrier });

            // setting the title escrow  address in the escrow factory so that it can return the correct title escrow when called by registry
            await titleEscrowFactoryGetterMock.setAddress(mockTitleEscrowContract.getAddress());

            await mockTitleEscrowContract.initializeMock(
              registryContractMock.getAddress(),
              tokenId,
              fakeAddress,
              fakeAddress,
              fakeAddress
            );
            // minting the token directly to the title escrow contract to set the correct ownerof function
            // this mintinter is a mock function which dosen't deploys the escrow contract
            await registryContractMock.mintInternal(mockTitleEscrowContract.getAddress(), tokenId);
            // achieving active status as
            await mockTitleEscrowContract.setActive(false);

            return [mockTitleEscrowContract as TitleEscrowMock, registryContractMock as TradeTrustTokenMock];
          };

          [mockTitleEscrowContract] = await loadFixture(deployMockFixtureRunner);
        });

        it("should revert when calling: onERC721Received", async () => {
          const tx = mockTitleEscrowContract.onERC721Received(fakeAddress, fakeAddress, tokenId, "0x00");
          await expect(tx).to.be.revertedWithCustomError(mockTitleEscrowContract, "InactiveTitleEscrow");
        });

        it("should revert when calling: nominate", async () => {
          const tx = mockTitleEscrowContract
            .connect(users.beneficiary)
            .nominate(fakeAddress, txnHexRemarks.nominateRemark);

          await expect(tx).to.be.revertedWithCustomError(mockTitleEscrowContract, "InactiveTitleEscrow");
        });

        it("should revert when calling: transferBeneficiary", async () => {
          const tx = mockTitleEscrowContract
            .connect(users.beneficiary)
            .transferBeneficiary(fakeAddress, txnHexRemarks.beneficiaryTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(mockTitleEscrowContract, "InactiveTitleEscrow");
        });

        it("should revert when calling: transferHolder", async () => {
          const tx = mockTitleEscrowContract
            .connect(users.beneficiary)
            .transferHolder(fakeAddress, txnHexRemarks.holderTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(mockTitleEscrowContract, "InactiveTitleEscrow");
        });

        it("should revert when calling: transferOwners", async () => {
          const tx = mockTitleEscrowContract
            .connect(users.beneficiary)
            .transferOwners(fakeAddress, fakeAddress, txnHexRemarks.transferOwnersRemark);

          await expect(tx).to.be.revertedWithCustomError(mockTitleEscrowContract, "InactiveTitleEscrow");
        });

        it("should revert when calling: shred", async () => {
          const tx = mockTitleEscrowContract.connect(users.beneficiary).shred(txnHexRemarks.burnRemark);

          await expect(tx).to.be.revertedWithCustomError(mockTitleEscrowContract, "InactiveTitleEscrow");
        });

        it("should not revert when calling: isHoldingToken", async () => {
          const res = await mockTitleEscrowContract.isHoldingToken();

          expect(res).to.be.true;
        });
      });
    });
  });

  describe("Operational Behaviors", () => {
    let registryContract: TradeTrustToken;
    let titleEscrowOwnerContract: TitleEscrow;

    let deployTokenFixtureRunner: DeployTokenFixtureRunner;

    // eslint-disable-next-line no-undef
    before(async () => {
      deployTokenFixtureRunner = async () =>
        createDeployFixtureRunner(
          ...(await deployTokenFixture<TradeTrustToken>({
            tokenContractName: "TradeTrustToken",
            tokenName: "The Great Shipping Company",
            tokenInitials: "GSC",
            deployer: users.carrier,
          }))
        );
    });

    beforeEach(async () => {
      [, registryContract] = await loadFixture(deployTokenFixtureRunner);
    });

    describe("Nomination", () => {
      beforeEach(async () => {
        await registryContract
          .connect(users.carrier)
          .mint(users.beneficiary.address, users.holder.address, tokenId, txnHexRemarks.mintRemark);
        titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, tokenId);
      });

      describe("Beneficiary Nomination", () => {
        let beneficiaryNominee: SignerWithAddress;

        beforeEach(async () => {
          [beneficiaryNominee] = users.others;
        });
        it("should not allow beneficiary to nominate when remark length exceeds", async () => {
          const tx = titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(beneficiaryNominee.address, exceededLengthRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "RemarkLengthExceeded");
        });

        it("should allow beneficiary to nominate a new beneficiary", async () => {
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);
          const res = await titleEscrowOwnerContract.nominee();

          expect(res).to.equal(beneficiaryNominee.address);
        });

        it("should allow beneficiary to revoke beneficiary nomination", async () => {
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);
          const initialNominee = await titleEscrowOwnerContract.nominee();
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(defaultAddress.Zero, txnHexRemarks.nominateRemark);
          const revokedNominee = await titleEscrowOwnerContract.nominee();

          expect(initialNominee).to.equal(beneficiaryNominee.address);
          expect(revokedNominee).to.equal(defaultAddress.Zero);
        });

        it("should not allow a non-beneficiary to nominate beneficiary", async () => {
          const tx = titleEscrowOwnerContract
            .connect(users.holder)
            .nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "CallerNotBeneficiary");
        });

        it("should not allow an ex-beneficiary to nominate", async () => {
          const newBeneficiary = users.others[0];
          const anotherBeneficiaryNominee = users.others[1];

          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(newBeneficiary.address, txnHexRemarks.nominateRemark);
          await titleEscrowOwnerContract
            .connect(users.holder)
            .transferBeneficiary(newBeneficiary.address, txnHexRemarks.beneficiaryTransferRemark);
          const tx = titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(anotherBeneficiaryNominee.address, txnHexRemarks.nominateRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "CallerNotBeneficiary");
        });

        it("should not allow nominating an existing beneficiary", async () => {
          const tx = titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(users.beneficiary.address, txnHexRemarks.nominateRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "TargetNomineeAlreadyBeneficiary");
        });

        it("should not allow nominating an address who is already a beneficiary nominee", async () => {
          const titleEscrowAsBeneficiary = titleEscrowOwnerContract.connect(users.beneficiary);
          await titleEscrowAsBeneficiary.nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);

          const tx = titleEscrowAsBeneficiary.nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowAsBeneficiary, "NomineeAlreadyNominated");
        });

        it("should not allow to nominate beneficiary when title escrow is not holding token", async () => {
          tokenId = faker.datatype.hexaDecimal(64);
          await registryContract
            .connect(users.carrier)
            .mint(users.beneficiary.address, users.beneficiary.address, tokenId, txnHexRemarks.mintRemark);
          const titleEscrowAsBeneficiary = (await getTitleEscrowContract(registryContract, tokenId)).connect(
            users.beneficiary
          );
          await titleEscrowAsBeneficiary.returnToIssuer(txnHexRemarks.returnToIssuerRemark);

          const tx = titleEscrowAsBeneficiary.nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowAsBeneficiary, "TitleEscrowNotHoldingToken");
        });

        it("should set prevBeneficiary to zero address upon nomination", async () => {
          const [owner, newBeneficiary] = users.others;
          // setting holder and beneficiary to same address
          await titleEscrowOwnerContract
            .connect(users.holder)
            .transferHolder(users.beneficiary.address, txnHexRemarks.transferOwnersRemark);

          // to set valid prev owners
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .transferOwners(owner.address, owner.address, txnHexRemarks.transferOwnersRemark);

          await titleEscrowOwnerContract
            .connect(owner)
            .transferBeneficiary(newBeneficiary.address, txnHexRemarks.beneficiaryTransferRemark);

          expect(await titleEscrowOwnerContract.prevBeneficiary()).to.equal(owner.address);

          await titleEscrowOwnerContract
            .connect(newBeneficiary)
            .nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);
          expect(await titleEscrowOwnerContract.prevBeneficiary()).to.equal(defaultAddress.Zero);
        });

        it("should emit Nomination event", async () => {
          const tx = titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);

          await expect(tx)
            .to.emit(titleEscrowOwnerContract, "Nomination")
            .withArgs(
              defaultAddress.Zero,
              beneficiaryNominee.address,
              registryContract.target,
              tokenId,
              txnHexRemarks.nominateRemark
            );
        });
      });
    });

    describe("Beneficiary and Holder Transfer", () => {
      beforeEach(async () => {
        await registryContract
          .connect(users.carrier)
          .mint(users.beneficiary.address, users.holder.address, tokenId, txnHexRemarks.mintRemark);
        titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, tokenId);
      });

      describe("Transfer Beneficiary", () => {
        let beneficiaryNominee: SignerWithAddress;

        beforeEach(async () => {
          [beneficiaryNominee] = users.others;
        });

        it("should allow holder to transfer to a nominated beneficiary", async () => {
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);

          await titleEscrowOwnerContract
            .connect(users.holder)
            .transferBeneficiary(beneficiaryNominee.address, txnHexRemarks.beneficiaryTransferRemark);
          const res = await titleEscrowOwnerContract.beneficiary();

          expect(res).to.equal(beneficiaryNominee.address);
        });

        it("should allow a beneficiary who is also a holder to transfer to a non-nominated beneficiary", async () => {
          const fakeTokenId = faker.datatype.hexaDecimal(64);
          const [targetNewOwner, targetNonBeneficiaryNominee] = users.others;
          await registryContract
            .connect(users.carrier)
            .mint(users.beneficiary.address, users.beneficiary.address, fakeTokenId, txnHexRemarks.mintRemark);
          titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, fakeTokenId);

          const initialBeneficiaryNominee = await titleEscrowOwnerContract.nominee();

          // to set valid prevBeneficiary and prevHolder
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .transferOwners(targetNewOwner.address, targetNewOwner.address, txnHexRemarks.transferOwnersRemark);

          await titleEscrowOwnerContract
            .connect(targetNewOwner)
            .transferBeneficiary(targetNonBeneficiaryNominee.address, txnHexRemarks.beneficiaryTransferRemark);

          expect(initialBeneficiaryNominee).to.equal(defaultAddress.Zero);
          expect(await titleEscrowOwnerContract.beneficiary()).to.equal(targetNonBeneficiaryNominee.address);
          expect(await titleEscrowOwnerContract.holder()).to.equal(targetNewOwner.address);
          expect(await titleEscrowOwnerContract.prevHolder()).to.equal(defaultAddress.Zero);
          expect(await titleEscrowOwnerContract.prevBeneficiary()).to.equal(targetNewOwner.address);
        });

        it("should not allow non-holder to transfer to a nominated beneficiary", async () => {
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);

          const tx = titleEscrowOwnerContract
            .connect(users.beneficiary)
            .transferBeneficiary(beneficiaryNominee.address, txnHexRemarks.beneficiaryTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "CallerNotHolder");
        });

        it("should not allow transferring to zero address", async () => {
          const tx = titleEscrowOwnerContract
            .connect(users.holder)
            .transferBeneficiary(defaultAddress.Zero, txnHexRemarks.beneficiaryTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "InvalidTransferToZeroAddress");
        });

        it("should not allow transferring to a non-nominated beneficiary", async () => {
          const fakeNonNominee = faker.finance.ethereumAddress();
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);

          const tx = titleEscrowOwnerContract
            .connect(users.holder)
            .transferBeneficiary(fakeNonNominee, txnHexRemarks.beneficiaryTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "InvalidNominee");
        });

        it("should reset nominated beneficiary", async () => {
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);

          await titleEscrowOwnerContract
            .connect(users.holder)
            .transferBeneficiary(beneficiaryNominee.address, txnHexRemarks.beneficiaryTransferRemark);
          const res = await titleEscrowOwnerContract.nominee();

          await expect(res).to.equal(defaultAddress.Zero);
        });

        it("should emit BeneficiaryTransfer event", async () => {
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);

          const tx = titleEscrowOwnerContract
            .connect(users.holder)
            .transferBeneficiary(beneficiaryNominee.address, txnHexRemarks.beneficiaryTransferRemark);

          await expect(tx)
            .to.emit(titleEscrowOwnerContract, "BeneficiaryTransfer")
            .withArgs(
              users.beneficiary.address,
              beneficiaryNominee.address,
              registryContract.target,
              tokenId,
              txnHexRemarks.beneficiaryTransferRemark
            );
        });
      });

      describe("Holder Transfer", () => {
        let targetNewHolder: SignerWithAddress;

        beforeEach(async () => {
          [targetNewHolder] = users.others;
        });
        it("should not allow transfer holder when remark length exceeds", async () => {
          const tx = titleEscrowOwnerContract
            .connect(users.holder)
            .transferHolder(targetNewHolder.address, exceededLengthRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "RemarkLengthExceeded");
        });

        it("should allow a holder to transfer to another holder", async () => {
          await titleEscrowOwnerContract
            .connect(users.holder)
            .transferHolder(targetNewHolder.address, txnHexRemarks.holderTransferRemark);
          const res = await titleEscrowOwnerContract.holder();

          expect(res).to.equal(targetNewHolder.address);
          expect(await titleEscrowOwnerContract.prevHolder()).to.equal(users.holder.address);
        });

        it("should allow a holder who is also a beneficiary to transfer holder", async () => {
          const fakeTokenId = faker.datatype.hexaDecimal(64);
          const [targetNewOwner, targetNonNominatedHolder] = users.others;
          await registryContract
            .connect(users.carrier)
            .mint(users.beneficiary.address, users.beneficiary.address, fakeTokenId, txnHexRemarks.mintRemark);
          titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, fakeTokenId);

          // to set valid prevBeneficiary and prevHolder
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .transferOwners(targetNewOwner.address, targetNewOwner.address, txnHexRemarks.transferOwnersRemark);

          await titleEscrowOwnerContract
            .connect(targetNewOwner)
            .transferHolder(targetNonNominatedHolder.address, txnHexRemarks.holderTransferRemark);
          const initialBeneficiaryNominee = await titleEscrowOwnerContract.nominee();
          expect(initialBeneficiaryNominee).to.equal(defaultAddress.Zero);
          expect(await titleEscrowOwnerContract.beneficiary()).to.equal(targetNewOwner.address);
          expect(await titleEscrowOwnerContract.holder()).to.equal(targetNonNominatedHolder.address);
          expect(await titleEscrowOwnerContract.prevHolder()).to.equal(targetNewOwner.address);
          expect(await titleEscrowOwnerContract.prevBeneficiary()).to.equal(defaultAddress.Zero);
        });

        it("should not allow a non-holder to transfer to a nominated holder", async () => {
          const tx = titleEscrowOwnerContract
            .connect(users.beneficiary)
            .transferHolder(targetNewHolder.address, txnHexRemarks.holderTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "CallerNotHolder");
        });

        it("should not allow endorsing zero address", async () => {
          const tx = titleEscrowOwnerContract
            .connect(users.holder)
            .transferHolder(defaultAddress.Zero, txnHexRemarks.holderTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "InvalidTransferToZeroAddress");
        });

        it("should not allow transferring to an existing holder", async () => {
          const tx = titleEscrowOwnerContract
            .connect(users.holder)
            .transferHolder(users.holder.address, txnHexRemarks.holderTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "RecipientAlreadyHolder");
        });

        it("should emit HolderTransfer event", async () => {
          const tx = titleEscrowOwnerContract
            .connect(users.holder)
            .transferHolder(targetNewHolder.address, txnHexRemarks.holderTransferRemark);

          await expect(tx)
            .to.emit(titleEscrowOwnerContract, "HolderTransfer")
            .withArgs(
              users.holder.address,
              targetNewHolder.address,
              await registryContract.getAddress(),
              tokenId,
              txnHexRemarks.holderTransferRemark
            );
        });
      });

      describe("Transfer all owners", () => {
        let beneficiaryNominee: SignerWithAddress;
        let holderNominee: SignerWithAddress;

        beforeEach(async () => {
          [beneficiaryNominee, holderNominee] = users.others;

          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);
        });

        it("should call transferBeneficiary and transferHolder internally", async () => {
          await titleEscrowOwnerContract
            .connect(users.holder)
            .transferOwners(beneficiaryNominee.address, holderNominee.address, txnHexRemarks.transferOwnersRemark);
          const [currentBeneficiary, currentHolder, prevBeneficiary, prevHolder] = await Promise.all([
            titleEscrowOwnerContract.beneficiary(),
            titleEscrowOwnerContract.holder(),
            titleEscrowOwnerContract.prevBeneficiary(),
            titleEscrowOwnerContract.prevHolder(),
          ]);

          expect(currentBeneficiary).to.equal(beneficiaryNominee.address);
          expect(currentHolder).to.equal(holderNominee.address);
          expect(prevBeneficiary).to.equal(users.beneficiary.address);
          expect(prevHolder).to.equal(users.holder.address);
          expect(await titleEscrowOwnerContract.remark()).to.equal(txnHexRemarks.transferOwnersRemark);
        });

        it("should revert when caller is not holder", async () => {
          const tx = titleEscrowOwnerContract
            .connect(users.beneficiary)
            .transferOwners(beneficiaryNominee.address, holderNominee.address, txnHexRemarks.holderTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "CallerNotHolder");
        });

        it("should emit BeneficiaryTransfer and HolderTransfer events", async () => {
          const tx = titleEscrowOwnerContract
            .connect(users.holder)
            .transferOwners(beneficiaryNominee.address, holderNominee.address, txnHexRemarks.transferOwnersRemark);

          await expect(tx)
            .to.emit(titleEscrowOwnerContract, "BeneficiaryTransfer")
            .withArgs(
              users.beneficiary.address,
              beneficiaryNominee.address,
              await registryContract.getAddress(),
              tokenId,
              txnHexRemarks.transferOwnersRemark
            );
          await expect(tx)
            .to.emit(titleEscrowOwnerContract, "HolderTransfer")
            .withArgs(
              users.holder.address,
              holderNominee.address,
              await registryContract.getAddress(),
              tokenId,
              txnHexRemarks.transferOwnersRemark
            );
        });
      });
    });

    describe("Beneficiary and Holder Rejection", () => {
      beforeEach(async () => {
        await registryContract
          .connect(users.carrier)
          .mint(users.beneficiary.address, users.holder.address, tokenId, txnHexRemarks.mintRemark);
        titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, tokenId);
      });
      describe("Reject Transfer Beneficiary", () => {
        let newBeneficiary: SignerWithAddress;
        let prevBeneficiary: SignerWithAddress;

        beforeEach(async () => {
          [newBeneficiary] = users.others;

          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(newBeneficiary.address, txnHexRemarks.nominateRemark);
          await titleEscrowOwnerContract
            .connect(users.holder)
            .transferBeneficiary(newBeneficiary.address, txnHexRemarks.beneficiaryTransferRemark);
          prevBeneficiary = users.beneficiary;
        });
        it("should have valid previous and new beneficiary", async () => {
          const previousBeneficiary = await titleEscrowOwnerContract.prevBeneficiary();
          expect(previousBeneficiary).to.equal(users.beneficiary.address);
          expect(await titleEscrowOwnerContract.beneficiary()).to.equal(newBeneficiary.address);
        });

        it("should not allow non-beneficiary to reject beneficiary transfer", async () => {
          const tx = titleEscrowOwnerContract
            .connect(users.holder)
            .rejectTransferBeneficiary(txnHexRemarks.rejectTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "CallerNotBeneficiary");
        });

        it("should not allow rejecting beneficiary transfer when there is no pending transfer", async () => {
          await titleEscrowOwnerContract
            .connect(newBeneficiary)
            .rejectTransferBeneficiary(txnHexRemarks.rejectTransferRemark);
          const tx = titleEscrowOwnerContract
            .connect(users.beneficiary)
            .rejectTransferBeneficiary(txnHexRemarks.rejectTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "InvalidTransferToZeroAddress");
        });

        it("should allow beneficiary to reject transfer beneficiary ", async () => {
          const tx = titleEscrowOwnerContract
            .connect(newBeneficiary)
            .rejectTransferBeneficiary(txnHexRemarks.rejectTransferRemark);

          await expect(tx)
            .to.emit(titleEscrowOwnerContract, "RejectTransferBeneficiary")
            .withArgs(
              newBeneficiary.address,
              prevBeneficiary.address,
              await registryContract.getAddress(),
              tokenId,
              txnHexRemarks.rejectTransferRemark
            );
          expect(await titleEscrowOwnerContract.beneficiary()).to.equal(prevBeneficiary.address);
          expect(await titleEscrowOwnerContract.prevBeneficiary()).to.equal(defaultAddress.Zero);
          expect(await titleEscrowOwnerContract.remark()).to.equal(txnHexRemarks.rejectTransferRemark);
        });
      });
      describe("Reject Transfer Holder", () => {
        let newHolder: SignerWithAddress;
        let prevHolder: SignerWithAddress;
        beforeEach(async () => {
          [newHolder] = users.others;
          await titleEscrowOwnerContract
            .connect(users.holder)
            .transferHolder(newHolder.address, txnHexRemarks.holderTransferRemark);
          titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, tokenId);
          prevHolder = users.holder;
        });
        it("should have a valid previous holder", async () => {
          expect(await titleEscrowOwnerContract.prevHolder()).to.equal(prevHolder.address);
          expect(await titleEscrowOwnerContract.holder()).to.equal(newHolder.address);
        });
        it("should not allow non-holder to reject holder transfer", async () => {
          const tx = titleEscrowOwnerContract
            .connect(users.beneficiary)
            .rejectTransferHolder(txnHexRemarks.rejectTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "CallerNotHolder");
        });
        it("should not allow holder to reject holder transfer when there is no pending transfer", async () => {
          await titleEscrowOwnerContract.connect(newHolder).rejectTransferHolder(txnHexRemarks.rejectTransferRemark);
          const tx = titleEscrowOwnerContract
            .connect(users.holder)
            .rejectTransferHolder(txnHexRemarks.rejectTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "InvalidTransferToZeroAddress");
        });
        it("should allow holder to reject holder transfer", async () => {
          await titleEscrowOwnerContract.connect(newHolder).rejectTransferHolder(txnHexRemarks.rejectTransferRemark);
          expect(await titleEscrowOwnerContract.holder()).to.equal(users.holder.address);
          expect(await titleEscrowOwnerContract.prevHolder()).to.equal(defaultAddress.Zero);
          expect(await titleEscrowOwnerContract.remark()).to.equal(txnHexRemarks.rejectTransferRemark);
        });
      });
      describe("1: Reject Transfer Owners when previous holder and owner are different", () => {
        let newBeneficiary: SignerWithAddress;
        let newHolder: SignerWithAddress;
        let previousHolder: SignerWithAddress;
        let previousBeneficiary: SignerWithAddress;
        let nonOwner: SignerWithAddress;
        beforeEach(async () => {
          [newBeneficiary, newHolder, nonOwner] = users.others;
          newHolder = newBeneficiary;
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(newBeneficiary.address, txnHexRemarks.nominateRemark);
          await titleEscrowOwnerContract
            .connect(users.holder)
            .transferBeneficiary(newBeneficiary.address, txnHexRemarks.beneficiaryTransferRemark);
          await titleEscrowOwnerContract
            .connect(users.holder)
            .transferHolder(newHolder.address, txnHexRemarks.holderTransferRemark);
          previousHolder = users.holder;
          previousBeneficiary = users.beneficiary;
        });
        it("should have correct prev and new holder/beneficiary", async () => {
          const [currentBeneficiary, currentHolder, _prevBeneficiary, _prevHolder] = await Promise.all([
            titleEscrowOwnerContract.beneficiary(),
            titleEscrowOwnerContract.holder(),
            titleEscrowOwnerContract.prevBeneficiary(),
            titleEscrowOwnerContract.prevHolder(),
          ]);
          expect(currentBeneficiary).to.equal(newBeneficiary.address);
          expect(currentHolder).to.equal(newHolder.address);
          expect(_prevBeneficiary).to.equal(users.beneficiary.address);
          expect(_prevHolder).to.equal(users.holder.address);
        });
        it("should not allow  non-owner to reject transfer owners", async () => {
          const tx = titleEscrowOwnerContract
            .connect(nonOwner)
            .rejectTransferOwners(txnHexRemarks.rejectTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "CallerNotBeneficiary");
        });
        it("should not allow holder to reject only holder transfer", async () => {
          const tx = titleEscrowOwnerContract
            .connect(newHolder)
            .rejectTransferHolder(txnHexRemarks.rejectTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "DualRoleRejectionRequired");
        });
        it("should not allow beneficiary to reject only beneficiary transfer", async () => {
          const tx = titleEscrowOwnerContract
            .connect(newBeneficiary)
            .rejectTransferBeneficiary(txnHexRemarks.rejectTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "DualRoleRejectionRequired");
        });
        it("should allow owner to reject transfer owners", async () => {
          expect(
            await titleEscrowOwnerContract.connect(newHolder).rejectTransferOwners(txnHexRemarks.rejectTransferRemark)
          )
            .to.emit(titleEscrowOwnerContract, "RejectTransferOwners")
            .withArgs(
              newBeneficiary.address,
              previousBeneficiary.address,
              newHolder.address,
              previousHolder.address,
              await registryContract.getAddress(),
              tokenId,
              txnHexRemarks.rejectTransferRemark
            );
          expect(await titleEscrowOwnerContract.holder()).to.equal(previousHolder.address);
          expect(await titleEscrowOwnerContract.beneficiary()).to.equal(previousBeneficiary.address);
          expect(await titleEscrowOwnerContract.prevHolder()).to.equal(defaultAddress.Zero);
          expect(await titleEscrowOwnerContract.prevBeneficiary()).to.equal(defaultAddress.Zero);
        });
      });
      describe("2: Reject Transfer Owners when previous holder and owner are same", () => {
        let prevOwner: SignerWithAddress;
        let newOwner: SignerWithAddress;
        let nonOwner: SignerWithAddress;
        beforeEach(async () => {
          [newOwner, nonOwner] = users.others;

          // setting up the title escrow with same holder and beneficiary
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(users.holder.address, txnHexRemarks.nominateRemark);
          await titleEscrowOwnerContract
            .connect(users.holder)
            .transferBeneficiary(users.holder.address, txnHexRemarks.beneficiaryTransferRemark);

          // setting up the new holder and beneficiary
          await titleEscrowOwnerContract
            .connect(users.holder)
            .transferOwners(newOwner.address, newOwner.address, txnHexRemarks.transferOwnersRemark);

          prevOwner = users.holder;
        });
        it("should have correct prev and new holder/beneficiary", async () => {
          const previousHolder = await titleEscrowOwnerContract.prevHolder();
          const previousBeneficiary = await titleEscrowOwnerContract.prevBeneficiary();
          const holder = await titleEscrowOwnerContract.holder();
          const beneficiary = await titleEscrowOwnerContract.beneficiary();
          expect(previousHolder).to.equal(prevOwner.address);
          expect(previousBeneficiary).to.equal(prevOwner.address);
          expect(holder).to.equal(newOwner.address);
          expect(beneficiary).to.equal(newOwner.address);
        });
        it("should not allow  non-owner to reject transfer owners", async () => {
          const tx = titleEscrowOwnerContract
            .connect(nonOwner)
            .rejectTransferOwners(txnHexRemarks.rejectTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "CallerNotBeneficiary");
        });
        it("should not allow new Owner to reject only holder transfer", async () => {
          const tx = titleEscrowOwnerContract
            .connect(newOwner)
            .rejectTransferHolder(txnHexRemarks.rejectTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "DualRoleRejectionRequired");
        });
        it("should not allow new Owner to reject only beneficiary transfer", async () => {
          const tx = titleEscrowOwnerContract
            .connect(newOwner)
            .rejectTransferBeneficiary(txnHexRemarks.rejectTransferRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "DualRoleRejectionRequired");
        });
        it("should allow new owner to reject transfer owners", async () => {
          expect(
            await titleEscrowOwnerContract.connect(newOwner).rejectTransferOwners(txnHexRemarks.rejectTransferRemark)
          )
            .to.emit(titleEscrowOwnerContract, "RejectTransferOwners")
            .withArgs(
              newOwner.address,
              prevOwner.address,
              newOwner.address,
              prevOwner.address,
              await registryContract.getAddress(),
              tokenId,
              txnHexRemarks.rejectTransferRemark
            );
          expect(await titleEscrowOwnerContract.holder()).to.equal(prevOwner.address);
          expect(await titleEscrowOwnerContract.beneficiary()).to.equal(prevOwner.address);
          expect(await titleEscrowOwnerContract.prevHolder()).to.equal(defaultAddress.Zero);
          expect(await titleEscrowOwnerContract.prevBeneficiary()).to.equal(defaultAddress.Zero);
          expect(await titleEscrowOwnerContract.remark()).to.equal(txnHexRemarks.rejectTransferRemark);
        });
      });
    });

    describe("Revert Rejection after any transaction", () => {
      beforeEach(async () => {
        await registryContract
          .connect(users.carrier)
          .mint(users.beneficiary.address, users.beneficiary.address, tokenId, txnHexRemarks.mintRemark);
        titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, tokenId);
      });
      describe("when holder and beneficiary are different", () => {
        let beneficiary: SignerWithAddress;
        let holder: SignerWithAddress;
        let prevBeneficiary: SignerWithAddress;
        let prevHolder: SignerWithAddress;
        let newBeneficiary: SignerWithAddress;
        let newHolder: SignerWithAddress;
        beforeEach(async () => {
          [holder, beneficiary, newBeneficiary, newHolder] = users.others;
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .transferOwners(beneficiary.address, holder.address, txnHexRemarks.transferOwnersRemark);
          prevBeneficiary = users.beneficiary;
          prevHolder = users.beneficiary;
        });
        it("should have correct initial values", async () => {
          const [currentBeneficiary, currentHolder, _prevBeneficiary, _prevHolder] = await Promise.all([
            titleEscrowOwnerContract.beneficiary(),
            titleEscrowOwnerContract.holder(),
            titleEscrowOwnerContract.prevBeneficiary(),
            titleEscrowOwnerContract.prevHolder(),
          ]);
          expect(currentBeneficiary).to.equal(beneficiary.address);
          expect(currentHolder).to.equal(holder.address);
          expect(_prevBeneficiary).to.equal(prevBeneficiary.address);
          expect(_prevHolder).to.equal(prevHolder.address);
        });
        it("should reset prevBeneficiary upon nomination", async () => {
          await titleEscrowOwnerContract
            .connect(beneficiary)
            .nominate(newBeneficiary.address, txnHexRemarks.nominateRemark);
          const [currentBeneficiary, currentHolder, _prevBeneficiary, _prevHolder] = await Promise.all([
            titleEscrowOwnerContract.beneficiary(),
            titleEscrowOwnerContract.holder(),
            titleEscrowOwnerContract.prevBeneficiary(),
            titleEscrowOwnerContract.prevHolder(),
          ]);
          expect(currentBeneficiary).to.equal(beneficiary.address);
          expect(currentHolder).to.equal(holder.address);
          expect(_prevBeneficiary).to.equal(defaultAddress.Zero);
          expect(_prevHolder).to.equal(prevHolder.address);
        });
        it("should set prevBeneficiary and reset prevHolder upon endorsing nominee", async () => {
          await titleEscrowOwnerContract
            .connect(beneficiary)
            .nominate(newBeneficiary.address, txnHexRemarks.nominateRemark);
          expect(await titleEscrowOwnerContract.prevBeneficiary()).to.equal(defaultAddress.Zero);
          await titleEscrowOwnerContract
            .connect(holder)
            .transferBeneficiary(newBeneficiary.address, txnHexRemarks.beneficiaryTransferRemark);
          const [currentBeneficiary, currentHolder, _prevBeneficiary, _prevHolder] = await Promise.all([
            titleEscrowOwnerContract.beneficiary(),
            titleEscrowOwnerContract.holder(),
            titleEscrowOwnerContract.prevBeneficiary(),
            titleEscrowOwnerContract.prevHolder(),
          ]);
          expect(currentBeneficiary).to.equal(newBeneficiary.address);
          expect(currentHolder).to.equal(holder.address);
          expect(_prevBeneficiary).to.equal(beneficiary.address);
          expect(_prevHolder).to.equal(defaultAddress.Zero);
        });
        it("should set prevHolder upon holder transfer", async () => {
          await titleEscrowOwnerContract
            .connect(holder)
            .transferHolder(newHolder.address, txnHexRemarks.holderTransferRemark);
          const [currentBeneficiary, currentHolder, _prevBeneficiary, _prevHolder] = await Promise.all([
            titleEscrowOwnerContract.beneficiary(),
            titleEscrowOwnerContract.holder(),
            titleEscrowOwnerContract.prevBeneficiary(),
            titleEscrowOwnerContract.prevHolder(),
          ]);
          expect(currentBeneficiary).to.equal(beneficiary.address);
          expect(currentHolder).to.equal(newHolder.address);
          expect(_prevBeneficiary).to.equal(prevBeneficiary.address);
          expect(_prevHolder).to.equal(holder.address);
        });
        it("should have correct values upon owners transfer", async () => {
          await titleEscrowOwnerContract
            .connect(beneficiary)
            .nominate(newBeneficiary.address, txnHexRemarks.nominateRemark);
          await titleEscrowOwnerContract
            .connect(holder)
            .transferOwners(newBeneficiary.address, newHolder.address, txnHexRemarks.transferOwnersRemark);
          const [currentBeneficiary, currentHolder, _prevBeneficiary, _prevHolder] = await Promise.all([
            titleEscrowOwnerContract.beneficiary(),
            titleEscrowOwnerContract.holder(),
            titleEscrowOwnerContract.prevBeneficiary(),
            titleEscrowOwnerContract.prevHolder(),
          ]);
          expect(currentBeneficiary).to.equal(newBeneficiary.address);
          expect(currentHolder).to.equal(newHolder.address);
          expect(_prevBeneficiary).to.equal(beneficiary.address);
          expect(_prevHolder).to.equal(holder.address);
        });
      });
      describe("when holder and beneficiary are same", () => {
        let owner: SignerWithAddress; // is both beneficiary and holder
        let newHolder: SignerWithAddress;
        let newBeneficiary: SignerWithAddress;
        let prevBeneficiary: SignerWithAddress;
        let prevHolder: SignerWithAddress;
        beforeEach(async () => {
          [owner, newBeneficiary, newHolder] = users.others;
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .transferOwners(owner.address, owner.address, txnHexRemarks.transferOwnersRemark);
          prevBeneficiary = users.beneficiary;
          prevHolder = users.beneficiary;
        });
        it("should have correct initial values", async () => {
          const [currentBeneficiary, currentHolder, _prevBeneficiary, _prevHolder] = await Promise.all([
            titleEscrowOwnerContract.beneficiary(),
            titleEscrowOwnerContract.holder(),
            titleEscrowOwnerContract.prevBeneficiary(),
            titleEscrowOwnerContract.prevHolder(),
          ]);
          expect(currentBeneficiary).to.equal(owner.address);
          expect(currentHolder).to.equal(owner.address);
          expect(_prevBeneficiary).to.equal(prevBeneficiary.address);
          expect(_prevHolder).to.equal(prevHolder.address);
        });
        it("should reset both prevBeneficiary and prevHolder upon nomination", async () => {
          await titleEscrowOwnerContract.connect(owner).nominate(newBeneficiary.address, txnHexRemarks.nominateRemark);
          const [currentBeneficiary, currentHolder, _prevBeneficiary, _prevHolder] = await Promise.all([
            titleEscrowOwnerContract.beneficiary(),
            titleEscrowOwnerContract.holder(),
            titleEscrowOwnerContract.prevBeneficiary(),
            titleEscrowOwnerContract.prevHolder(),
          ]);
          expect(currentBeneficiary).to.equal(owner.address);
          expect(currentHolder).to.equal(owner.address);
          expect(_prevBeneficiary).to.equal(defaultAddress.Zero);
          expect(_prevHolder).to.equal(defaultAddress.Zero);
        });
        it("should reset prevBeneficiary upon holder transfer", async () => {
          await titleEscrowOwnerContract
            .connect(owner)
            .transferHolder(newHolder.address, txnHexRemarks.holderTransferRemark);
          const [currentBeneficiary, currentHolder, _prevBeneficiary, _prevHolder] = await Promise.all([
            titleEscrowOwnerContract.beneficiary(),
            titleEscrowOwnerContract.holder(),
            titleEscrowOwnerContract.prevBeneficiary(),
            titleEscrowOwnerContract.prevHolder(),
          ]);
          expect(currentBeneficiary).to.equal(owner.address);
          expect(currentHolder).to.equal(newHolder.address);
          expect(_prevBeneficiary).to.equal(defaultAddress.Zero);
          expect(_prevHolder).to.equal(owner.address);
        });
        it("should reset prevHolder upon beneficiary transfer", async () => {
          await titleEscrowOwnerContract
            .connect(owner)
            .transferBeneficiary(newBeneficiary.address, txnHexRemarks.beneficiaryTransferRemark);
          const [currentBeneficiary, currentHolder, _prevBeneficiary, _prevHolder] = await Promise.all([
            titleEscrowOwnerContract.beneficiary(),
            titleEscrowOwnerContract.holder(),
            titleEscrowOwnerContract.prevBeneficiary(),
            titleEscrowOwnerContract.prevHolder(),
          ]);
          expect(currentBeneficiary).to.equal(newBeneficiary.address);
          expect(currentHolder).to.equal(owner.address);
          expect(_prevBeneficiary).to.equal(owner.address);
          expect(_prevHolder).to.equal(defaultAddress.Zero);
        });
        it("should reset both prevBeneficiary and prevHolder upon returnToIssuer", async () => {
          await titleEscrowOwnerContract.connect(owner).returnToIssuer(txnHexRemarks.returnToIssuerRemark);
          const [currentBeneficiary, currentHolder, _prevBeneficiary, _prevHolder] = await Promise.all([
            titleEscrowOwnerContract.beneficiary(),
            titleEscrowOwnerContract.holder(),
            titleEscrowOwnerContract.prevBeneficiary(),
            titleEscrowOwnerContract.prevHolder(),
          ]);
          expect(currentBeneficiary).to.equal(owner.address);
          expect(currentHolder).to.equal(owner.address);
          expect(_prevBeneficiary).to.equal(defaultAddress.Zero);
          expect(_prevHolder).to.equal(defaultAddress.Zero);
        });
      });
    });

    describe("ReturnToIssuer", () => {
      let beneficiary: SignerWithAddress;
      let holder: SignerWithAddress;

      beforeEach(async () => {
        // eslint-disable-next-line no-multi-assign
        beneficiary = holder = users.others[users.others.length - 1];
        await registryContract
          .connect(users.carrier)
          .mint(beneficiary.address, holder.address, tokenId, txnHexRemarks.mintRemark);
        titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, tokenId);
      });

      it("should not allow returning to issuer when remark length exceeds", async () => {
        const tx = titleEscrowOwnerContract.connect(beneficiary).returnToIssuer(exceededLengthRemark);

        await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "RemarkLengthExceeded");
      });

      it("should allow a beneficiary who is also a holder to returnToIssuer", async () => {
        await titleEscrowOwnerContract.connect(beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        const res = await registryContract.ownerOf(tokenId);

        expect(res).to.equal(registryContract.target);
      });

      it("should not allow returning to issuer when title escrow is not holding token", async () => {
        await titleEscrowOwnerContract.connect(beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);
        const tx = titleEscrowOwnerContract.connect(beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "TitleEscrowNotHoldingToken");
      });

      it("should not allow a beneficiary only to returnToIssuer", async () => {
        tokenId = faker.datatype.hexaDecimal(64);
        await registryContract
          .connect(users.carrier)
          .mint(users.beneficiary.address, users.holder.address, tokenId, txnHexRemarks.mintRemark);
        titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, tokenId);

        const tx = titleEscrowOwnerContract
          .connect(users.beneficiary)
          .returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "CallerNotHolder");
      });

      it("should not allow a holder only to returnToIssuer", async () => {
        tokenId = faker.datatype.hexaDecimal(64);
        await registryContract
          .connect(users.carrier)
          .mint(users.beneficiary.address, users.holder.address, tokenId, txnHexRemarks.mintRemark);
        titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, tokenId);

        const tx = titleEscrowOwnerContract.connect(users.holder).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "CallerNotBeneficiary");
      });

      it("should reset beneficiary nominee", async () => {
        const beneficiaryNominee = ethers.getAddress(faker.finance.ethereumAddress());
        const titleEscrowAsBeneficiary = titleEscrowOwnerContract.connect(beneficiary);
        await titleEscrowAsBeneficiary.nominate(beneficiaryNominee, txnHexRemarks.nominateRemark);
        const initialBeneficiaryNominee = await titleEscrowOwnerContract.nominee();

        await titleEscrowAsBeneficiary.returnToIssuer(txnHexRemarks.returnToIssuerRemark);
        const currentBeneficiaryNominee = await titleEscrowOwnerContract.nominee();

        expect(initialBeneficiaryNominee).to.deep.equal(beneficiaryNominee);
        expect(currentBeneficiaryNominee).to.deep.equal(defaultAddress.Zero);
      });

      it("should transfer token back to registry", async () => {
        const initialOwner = await registryContract.ownerOf(tokenId);

        await titleEscrowOwnerContract.connect(beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);
        const currentOwner = await registryContract.ownerOf(tokenId);

        expect(initialOwner).to.equal(titleEscrowOwnerContract.target);
        expect(currentOwner).to.equal(registryContract.target);
      });

      it("should not hold token after returning to issuer", async () => {
        const initialHoldingStatus = await titleEscrowOwnerContract.isHoldingToken();

        await titleEscrowOwnerContract.connect(beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);
        const currentHoldingStatus = await titleEscrowOwnerContract.isHoldingToken();

        expect(initialHoldingStatus).to.equal(true);
        expect(currentHoldingStatus).to.equal(false);
      });

      it("should emit ReturnToIssuer event with correct values", async () => {
        const tx = titleEscrowOwnerContract.connect(beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        await expect(tx)
          .to.emit(titleEscrowOwnerContract, "ReturnToIssuer")
          .withArgs(beneficiary.address, registryContract.target, tokenId, txnHexRemarks.returnToIssuerRemark);
      });
      it("should reset previous beneficiary and holder", async () => {
        const [newOwner] = users.others;
        // holder == beneficiary
        await titleEscrowOwnerContract
          .connect(beneficiary)
          .transferOwners(newOwner.address, newOwner.address, txnHexRemarks.transferOwnersRemark);

        expect(await titleEscrowOwnerContract.prevBeneficiary()).to.equal(beneficiary.address);
        expect(await titleEscrowOwnerContract.prevHolder()).to.equal(holder.address);

        await titleEscrowOwnerContract.connect(newOwner).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        expect(await titleEscrowOwnerContract.prevBeneficiary()).to.equal(defaultAddress.Zero);
        expect(await titleEscrowOwnerContract.prevHolder()).to.equal(defaultAddress.Zero);
      });
    });

    describe("Shredding", () => {
      let registrySigner: Signer;

      beforeEach(async () => {
        registrySigner = await impersonateAccount({ address: registryContract.target as string });
        await registryContract
          .connect(users.carrier)
          .mint(users.beneficiary.address, users.beneficiary.address, tokenId, txnHexRemarks.mintRemark);
        titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, tokenId);
      });

      it("should not allow shredding when remark length exceeds", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);
        const tx = titleEscrowOwnerContract.connect(registrySigner).shred(exceededLengthRemark);

        await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "RemarkLengthExceeded");
      });

      it("should allow to be called from registry", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);
        const holdingStatus = await titleEscrowOwnerContract.isHoldingToken();

        await titleEscrowOwnerContract.connect(registrySigner).shred(txnHexRemarks.burnRemark);

        expect(holdingStatus).to.equal(false);
      });

      it("should not allow to shred when title escrow is holding token", async () => {
        const holdingStatus = await titleEscrowOwnerContract.isHoldingToken();

        const tx = titleEscrowOwnerContract.connect(registrySigner).shred(txnHexRemarks.burnRemark);

        expect(holdingStatus).to.equal(true);
        await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "TokenNotReturnedToIssuer");
      });

      it("should not allow to be called from non-registry", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        const tx = titleEscrowOwnerContract.connect(users.beneficiary).shred(txnHexRemarks.burnRemark);

        await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "InvalidRegistry");
      });

      it("should reset nominated beneficiary", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        await titleEscrowOwnerContract.connect(registrySigner).shred(txnHexRemarks.burnRemark);
        const res = await titleEscrowOwnerContract.nominee();

        expect(res).to.equal(defaultAddress.Zero);
      });

      it("should reset beneficiary", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        await titleEscrowOwnerContract.connect(registrySigner).shred(txnHexRemarks.burnRemark);
        const res = await titleEscrowOwnerContract.beneficiary();

        expect(res).to.equal(defaultAddress.Zero);
      });

      it("should reset holder", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        await titleEscrowOwnerContract.connect(registrySigner).shred(txnHexRemarks.burnRemark);
        const res = await titleEscrowOwnerContract.holder();

        expect(res).to.equal(defaultAddress.Zero);
      });

      it("should set active status to false", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        await titleEscrowOwnerContract.connect(registrySigner).shred(txnHexRemarks.burnRemark);
        const res = await titleEscrowOwnerContract.active();

        expect(res).to.false;
      });

      it("should emit Shred event", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        const tx = titleEscrowOwnerContract.connect(registrySigner).shred(txnHexRemarks.burnRemark);

        await expect(tx)
          .to.emit(titleEscrowOwnerContract, "Shred")
          .withArgs(registryContract.target, tokenId, txnHexRemarks.burnRemark);
      });
    });
  });
});
