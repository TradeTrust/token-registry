import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  TitleEscrow,
  TitleEscrowFactoryGetterMock,
  TitleEscrowMock,
  TradeTrustToken,
  TradeTrustTokenMock,
} from "@tradetrust/contracts";
import { Signer } from "ethers";
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
  const exceededLengthRemark = ethers.utils.hexlify(ethers.utils.randomBytes(121));

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

      deployFixturesRunner = async () => {
        const [, registryContractFixture] = await deployTokenFixture<TradeTrustToken>({
          tokenContractName: "TradeTrustToken",
          tokenName: "The Great Shipping Company",
          tokenInitials: "GSC",
          deployer: users.carrier,
        });
        const implContractFixture = await deployTitleEscrowFixture({ deployer });
        const titleEscrowContractFixture = await deployImplProxy<TitleEscrow>({
          implementation: implContractFixture,
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
      await expect(tx).to.be.revertedWith("Initializable: contract is already initialized");
    });

    describe("Initialisation", () => {
      let fakeRegistryAddress: string;

      beforeEach(async () => {
        fakeRegistryAddress = ethers.utils.getAddress(faker.finance.ethereumAddress());

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
          address: fakeRegistry.address,
        });
        fakeAddress = ethers.utils.getAddress(faker.finance.ethereumAddress());

        await titleEscrowContract.initialize(fakeRegistry.address, tokenId);
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
          data = new ethers.utils.AbiCoder().encode(
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
                fakeRegistry.address,
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
            data = new ethers.utils.AbiCoder().encode(
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
            data = new ethers.utils.AbiCoder().encode(
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
              .withArgs(users.beneficiary.address, users.holder.address, false, fakeRegistry.address, tokenId, "0x");
          });
        });

        describe("Beneficiary and Holder Transfer Events", () => {
          it("should emit BeneficiaryTransfer event", async () => {
            const tx = titleEscrowContract
              .connect(fakeRegistry.wallet as Signer)
              .onERC721Received(fakeAddress, fakeAddress, tokenId, data);

            await expect(tx)
              .to.emit(titleEscrowContract, "BeneficiaryTransfer")
              .withArgs(defaultAddress.Zero, users.beneficiary.address, fakeRegistry.address, tokenId, "0x");
          });

          it("should emit HolderTransfer event", async () => {
            const tx = titleEscrowContract
              .connect(fakeRegistry.wallet as Signer)
              .onERC721Received(fakeAddress, fakeAddress, tokenId, data);

            await expect(tx)
              .to.emit(titleEscrowContract, "HolderTransfer")
              .withArgs(defaultAddress.Zero, users.holder.address, fakeRegistry.address, tokenId, "0x");
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
        await titleEscrowOwnerContract.connect(users.beneficiary).surrender(txnHexRemarks.surrenderRemark);

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
        await titleEscrowContract.initialize(registryContract.address, tokenId);
        const res = await titleEscrowContract.active();
        expect(res).to.be.true;
      });

      describe("When title escrow is not active", () => {
        let fakeAddress: string;
        let mockTitleEscrowContract: TitleEscrowMock;
        beforeEach(async () => {
          fakeAddress = ethers.utils.getAddress(faker.finance.ethereumAddress());
          const deployMockFixtureRunner = async (): Promise<[TitleEscrowMock, TradeTrustTokenMock]> => {
            // Deploying the title escrow factory contract mock to return the title escrow mock correctly
            const titleEscrowFactoryGetterMock = (await (
              await ethers.getContractFactory("TitleEscrowFactoryGetterMock")
            ).deploy()) as TitleEscrowFactoryGetterMock;

            // Deploy the TradeTrustTokenMock contract to be used as the registry and adding escrow factory address
            const [, registryContractMock] = await deployTokenFixture<TradeTrustTokenMock>({
              tokenContractName: "TradeTrustTokenMock",
              tokenName: "The Great Shipping Company",
              tokenInitials: "GSC",
              deployer: users.carrier,
              escrowFactoryAddress: titleEscrowFactoryGetterMock.address,
            });

            // Deploy the Title Escrow mock contract and initialize it with the required parameters
            mockTitleEscrowContract = await deployTitleEscrowMockFixture({ deployer: users.carrier });

            // setting the title escrow  address in the escrow factory so that it can return the correct title escrow when called by registry
            await titleEscrowFactoryGetterMock.setAddress(mockTitleEscrowContract.address);

            await mockTitleEscrowContract.initializeMock(
              registryContractMock.address,
              tokenId,
              fakeAddress,
              fakeAddress,
              fakeAddress
            );
            // minting the token directly to the title escrow contract to set the correct ownerof function
            // this mintinter is a mock function which dosen't deploys the escrow contract
            await registryContractMock.mintInternal(mockTitleEscrowContract.address, tokenId);
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

  describe("Operational Behaviours", () => {
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
          await titleEscrowAsBeneficiary.surrender(txnHexRemarks.surrenderRemark);

          const tx = titleEscrowAsBeneficiary.nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowAsBeneficiary, "TitleEscrowNotHoldingToken");
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
              registryContract.address,
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
          const [targetNonBeneficiaryNominee] = users.others;
          await registryContract
            .connect(users.carrier)
            .mint(users.beneficiary.address, users.beneficiary.address, fakeTokenId, txnHexRemarks.mintRemark);
          titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, fakeTokenId);

          const initialBeneficiaryNominee = await titleEscrowOwnerContract.nominee();
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .transferBeneficiary(targetNonBeneficiaryNominee.address, txnHexRemarks.beneficiaryTransferRemark);
          const currentBeneficiary = await titleEscrowOwnerContract.beneficiary();

          expect(initialBeneficiaryNominee).to.equal(defaultAddress.Zero);
          expect(currentBeneficiary).to.equal(targetNonBeneficiaryNominee.address);
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
              registryContract.address,
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
        });

        it("should allow a holder who is also a beneficiary to transfer holder", async () => {
          const fakeTokenId = faker.datatype.hexaDecimal(64);
          const [targetNonNominatedHolder] = users.others;
          await registryContract
            .connect(users.carrier)
            .mint(users.beneficiary.address, users.beneficiary.address, fakeTokenId, txnHexRemarks.mintRemark);
          titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, fakeTokenId);

          const initialBeneficiaryNominee = await titleEscrowOwnerContract.nominee();
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .transferHolder(targetNonNominatedHolder.address, txnHexRemarks.holderTransferRemark);
          const currentHolder = await titleEscrowOwnerContract.holder();

          expect(initialBeneficiaryNominee).to.equal(defaultAddress.Zero);
          expect(currentHolder).to.equal(targetNonNominatedHolder.address);
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
              registryContract.address,
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

        it("should call transferBeneficiary and transferHolder interally", async () => {
          await titleEscrowOwnerContract
            .connect(users.holder)
            .transferOwners(beneficiaryNominee.address, holderNominee.address, txnHexRemarks.holderTransferRemark);
          const [currentBeneficiary, currentHolder] = await Promise.all([
            titleEscrowOwnerContract.beneficiary(),
            titleEscrowOwnerContract.holder(),
          ]);

          expect(currentBeneficiary).to.equal(beneficiaryNominee.address);
          expect(currentHolder).to.equal(holderNominee.address);
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
              registryContract.address,
              tokenId,
              txnHexRemarks.transferOwnersRemark
            );
          await expect(tx)
            .to.emit(titleEscrowOwnerContract, "HolderTransfer")
            .withArgs(
              users.holder.address,
              holderNominee.address,
              registryContract.address,
              tokenId,
              txnHexRemarks.transferOwnersRemark
            );
        });
      });
    });

    describe("Surrendering", () => {
      let beneficiary: SignerWithAddress;
      let holder: SignerWithAddress;

      beforeEach(async () => {
        // eslint-disable-next-line no-multi-assign
        beneficiary = holder = users.others[faker.datatype.number(users.others.length - 1)];
        await registryContract
          .connect(users.carrier)
          .mint(beneficiary.address, holder.address, tokenId, txnHexRemarks.mintRemark);
        titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, tokenId);
      });

      it("should not allow surrendering when remark length exceeds", async () => {
        const tx = titleEscrowOwnerContract.connect(beneficiary).surrender(exceededLengthRemark);

        await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "RemarkLengthExceeded");
      });

      it("should allow a beneficiary who is also a holder to surrender", async () => {
        await titleEscrowOwnerContract.connect(beneficiary).surrender(txnHexRemarks.surrenderRemark);

        const res = await registryContract.ownerOf(tokenId);

        expect(res).to.equal(registryContract.address);
      });

      it("should not allow surrendering when title escrow is not holding token", async () => {
        await titleEscrowOwnerContract.connect(beneficiary).surrender(txnHexRemarks.surrenderRemark);
        const tx = titleEscrowOwnerContract.connect(beneficiary).surrender(txnHexRemarks.surrenderRemark);

        await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "TitleEscrowNotHoldingToken");
      });

      it("should not allow a beneficiary only to surrender", async () => {
        tokenId = faker.datatype.hexaDecimal(64);
        await registryContract
          .connect(users.carrier)
          .mint(users.beneficiary.address, users.holder.address, tokenId, txnHexRemarks.mintRemark);
        titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, tokenId);

        const tx = titleEscrowOwnerContract.connect(users.beneficiary).surrender(txnHexRemarks.surrenderRemark);

        await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "CallerNotHolder");
      });

      it("should not allow a holder only to surrender", async () => {
        tokenId = faker.datatype.hexaDecimal(64);
        await registryContract
          .connect(users.carrier)
          .mint(users.beneficiary.address, users.holder.address, tokenId, txnHexRemarks.mintRemark);
        titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, tokenId);

        const tx = titleEscrowOwnerContract.connect(users.holder).surrender(txnHexRemarks.surrenderRemark);

        await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "CallerNotBeneficiary");
      });

      it("should reset beneficiary nominee", async () => {
        const beneficiaryNominee = ethers.utils.getAddress(faker.finance.ethereumAddress());
        const titleEscrowAsBeneficiary = titleEscrowOwnerContract.connect(beneficiary);
        await titleEscrowAsBeneficiary.nominate(beneficiaryNominee, txnHexRemarks.nominateRemark);
        const initialBeneficiaryNominee = await titleEscrowOwnerContract.nominee();

        await titleEscrowAsBeneficiary.surrender(txnHexRemarks.surrenderRemark);
        const currentBeneficiaryNominee = await titleEscrowOwnerContract.nominee();

        expect(initialBeneficiaryNominee).to.deep.equal(beneficiaryNominee);
        expect(currentBeneficiaryNominee).to.deep.equal(defaultAddress.Zero);
      });

      it("should transfer token back to registry", async () => {
        const initialOwner = await registryContract.ownerOf(tokenId);

        await titleEscrowOwnerContract.connect(beneficiary).surrender(txnHexRemarks.surrenderRemark);
        const currentOwner = await registryContract.ownerOf(tokenId);

        expect(initialOwner).to.equal(titleEscrowOwnerContract.address);
        expect(currentOwner).to.equal(registryContract.address);
      });

      it("should not hold token after surrendering", async () => {
        const initialHoldingStatus = await titleEscrowOwnerContract.isHoldingToken();

        await titleEscrowOwnerContract.connect(beneficiary).surrender(txnHexRemarks.surrenderRemark);
        const currentHoldingStatus = await titleEscrowOwnerContract.isHoldingToken();

        expect(initialHoldingStatus).to.equal(true);
        expect(currentHoldingStatus).to.equal(false);
      });

      it("should emit Surrender event with correct values", async () => {
        const tx = titleEscrowOwnerContract.connect(beneficiary).surrender(txnHexRemarks.surrenderRemark);

        await expect(tx)
          .to.emit(titleEscrowOwnerContract, "Surrender")
          .withArgs(beneficiary.address, registryContract.address, tokenId, txnHexRemarks.surrenderRemark);
      });
    });

    describe("Shredding", () => {
      let registrySigner: Signer;

      beforeEach(async () => {
        registrySigner = await impersonateAccount({ address: registryContract.address });
        await registryContract
          .connect(users.carrier)
          .mint(users.beneficiary.address, users.beneficiary.address, tokenId, txnHexRemarks.mintRemark);
        titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, tokenId);
      });

      it("should not allow shredding when remark length exceeds", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).surrender(txnHexRemarks.surrenderRemark);
        const tx = titleEscrowOwnerContract.connect(registrySigner).shred(exceededLengthRemark);

        await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "RemarkLengthExceeded");
      });

      it("should allow to be called from registry", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).surrender(txnHexRemarks.surrenderRemark);
        const holdingStatus = await titleEscrowOwnerContract.isHoldingToken();

        await titleEscrowOwnerContract.connect(registrySigner).shred(txnHexRemarks.burnRemark);

        expect(holdingStatus).to.equal(false);
      });

      it("should not allow to shred when title escrow is holding token", async () => {
        const holdingStatus = await titleEscrowOwnerContract.isHoldingToken();

        const tx = titleEscrowOwnerContract.connect(registrySigner).shred(txnHexRemarks.burnRemark);

        expect(holdingStatus).to.equal(true);
        await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "TokenNotSurrendered");
      });

      it("should not allow to be called from non-registry", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).surrender(txnHexRemarks.surrenderRemark);

        const tx = titleEscrowOwnerContract.connect(users.beneficiary).shred(txnHexRemarks.burnRemark);

        await expect(tx).to.be.revertedWithCustomError(titleEscrowOwnerContract, "InvalidRegistry");
      });

      it("should reset nominated beneficiary", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).surrender(txnHexRemarks.surrenderRemark);

        await titleEscrowOwnerContract.connect(registrySigner).shred(txnHexRemarks.burnRemark);
        const res = await titleEscrowOwnerContract.nominee();

        expect(res).to.equal(defaultAddress.Zero);
      });

      it("should reset beneficiary", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).surrender(txnHexRemarks.surrenderRemark);

        await titleEscrowOwnerContract.connect(registrySigner).shred(txnHexRemarks.burnRemark);
        const res = await titleEscrowOwnerContract.beneficiary();

        expect(res).to.equal(defaultAddress.Zero);
      });

      it("should reset holder", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).surrender(txnHexRemarks.surrenderRemark);

        await titleEscrowOwnerContract.connect(registrySigner).shred(txnHexRemarks.burnRemark);
        const res = await titleEscrowOwnerContract.holder();

        expect(res).to.equal(defaultAddress.Zero);
      });

      it("should set active status to false", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).surrender(txnHexRemarks.surrenderRemark);

        await titleEscrowOwnerContract.connect(registrySigner).shred(txnHexRemarks.burnRemark);
        const res = await titleEscrowOwnerContract.active();

        expect(res).to.false;
      });

      it("should emit Shred event", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).surrender(txnHexRemarks.surrenderRemark);

        const tx = titleEscrowOwnerContract.connect(registrySigner).shred(txnHexRemarks.burnRemark);

        await expect(tx)
          .to.emit(titleEscrowOwnerContract, "Shred")
          .withArgs(registryContract.address, tokenId, txnHexRemarks.burnRemark);
      });
    });
  });
});
