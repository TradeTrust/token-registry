/* eslint-disable no-underscore-dangle */
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TitleEscrowFactoryGetterMock, TitleEscrowSignable, TradeTrustTokenMock } from "@tradetrust/contracts";
import { Signature, Signer } from "ethers";
import faker from "faker";
import { ethers } from "hardhat";
import { assert, expect } from ".";
import { contractInterfaceId } from "../src/constants";
import { deployTokenFixture } from "./fixtures";
import { deployImplProxy } from "./fixtures/deploy-impl-proxy.fixture";
import { getTestUsers, impersonateAccount, TestUsers, txnRemarks } from "./helpers";

type BeneficiaryTransferData = {
  beneficiary: string;
  holder: string;
  nominee: string;
  registry: string;
  tokenId: string;
  deadline: number;
  nonce: number;
};

describe("TitleEscrowSignable", async () => {
  let users: TestUsers;
  let deployer: SignerWithAddress;

  let titleEscrowContract: TitleEscrowSignable;

  const domainName = "TradeTrust Title Escrow";
  let domain: Record<string, any>;

  let deployFixturesRunner: () => Promise<[TitleEscrowSignable]>;
  // let deployTokenFixtureRunner: DeployTokenFixtureRunner;

  // eslint-disable-next-line no-undef
  before(async () => {
    users = await getTestUsers();
    deployer = users.carrier;

    deployFixturesRunner = async () => {
      const titleEscrowSignableFixture = (await (await ethers.getContractFactory("TitleEscrowSignable"))
        .connect(deployer)
        .deploy()) as TitleEscrowSignable;
      const titleEscrowWithProxy = await deployImplProxy<TitleEscrowSignable>({
        implementation: titleEscrowSignableFixture,
        deployer,
      });

      return [titleEscrowWithProxy];
    };
  });

  beforeEach(async () => {
    [titleEscrowContract] = await loadFixture(deployFixturesRunner);

    const chainId = await deployer.getChainId();
    domain = {
      name: domainName,
      version: "1",
      chainId,
      verifyingContract: titleEscrowContract.address,
    };
  });

  describe("Setup", () => {
    it("should have correct name", async () => {
      const res = await titleEscrowContract.name();

      expect(res).to.equal(domainName);
    });

    it("should have correct beneficiary transfer type hash", async () => {
      const typeHash = ethers.utils.id(
        "BeneficiaryTransfer(address beneficiary,address holder,address nominee,address registry,uint256 tokenId,uint256 deadline,uint256 nonce)"
      );

      const res = await titleEscrowContract.BENEFICIARY_TRANSFER_TYPEHASH();

      expect(res).to.equal(typeHash);
    });

    it("should support TitleEscrowSignable interface", async () => {
      const interfaceId = contractInterfaceId.TitleEscrowSignable;

      const res = await titleEscrowContract.supportsInterface(interfaceId);

      expect(res).to.be.true;
    });

    it("should support TitleEscrow interface", async () => {
      const interfaceId = contractInterfaceId.TitleEscrow;

      const res = await titleEscrowContract.supportsInterface(interfaceId);

      expect(res).to.be.true;
    });
  });

  describe("Initialisation", () => {
    let fakeRegistryAddress: string;
    let fakeTokenId: string;

    beforeEach(async () => {
      fakeRegistryAddress = ethers.utils.getAddress(faker.finance.ethereumAddress());
      fakeTokenId = faker.datatype.hexaDecimal(64);
    });

    it("should initialise the correct registry", async () => {
      await titleEscrowContract.initialize(fakeRegistryAddress, fakeTokenId);

      const res = await titleEscrowContract.registry();

      expect(res).to.equal(fakeRegistryAddress);
    });

    it("should initialise the correct token ID", async () => {
      await titleEscrowContract.initialize(fakeRegistryAddress, fakeTokenId);

      const res = await titleEscrowContract.tokenId();

      expect(res).to.equal(fakeTokenId);
    });

    it("should initialise domain separator correctly", async () => {
      const hashDomain = ethers.utils._TypedDataEncoder.hashDomain(domain);
      await titleEscrowContract.initialize(fakeRegistryAddress, fakeTokenId);

      const res = await titleEscrowContract.DOMAIN_SEPARATOR();

      expect(res).to.equal(hashDomain);
    });
  });

  describe("Operational Behaviours", () => {
    let fakeRegistryContract: TradeTrustTokenMock;
    let fakeTokenId: string;
    let titleEscrowContractAsBeneficiary: TitleEscrowSignable;
    let registrySigner: Signer;

    beforeEach(async () => {
      // Deploying the title escrow factory contract mock to return the title escrow mock correctly
      const titleEscrowFactoryGetterMock = (await (await ethers.getContractFactory("TitleEscrowFactoryGetterMock"))
        .connect(users.carrier)
        .deploy()) as TitleEscrowFactoryGetterMock;
      await titleEscrowFactoryGetterMock.setAddress(titleEscrowContract.address);
      const [, registryContract] = await deployTokenFixture<TradeTrustTokenMock>({
        tokenContractName: "TradeTrustTokenMock",
        tokenName: "The Great Shipping Company",
        tokenInitials: "GSC",
        deployer: users.carrier,
        escrowFactoryAddress: titleEscrowFactoryGetterMock.address,
      });
      fakeRegistryContract = registryContract;
      registrySigner = await impersonateAccount({ address: fakeRegistryContract.address });

      fakeTokenId = faker.datatype.hexaDecimal(64);
      titleEscrowContractAsBeneficiary = titleEscrowContract.connect(users.beneficiary);
      await titleEscrowContract.initialize(fakeRegistryContract.address, fakeTokenId);

      const data = new ethers.utils.AbiCoder().encode(
        ["address", "address"],
        [users.beneficiary.address, users.holder.address]
      );
      await titleEscrowContract
        .connect(registrySigner as Signer)
        .onERC721Received(ethers.constants.AddressZero, ethers.constants.AddressZero, fakeTokenId, data);
      await fakeRegistryContract.mintInternal(titleEscrowContract.address, fakeTokenId);
    });

    describe("Registry State Validations", () => {
      const fakeEndorsement = {
        beneficiary: faker.finance.ethereumAddress(),
        holder: faker.finance.ethereumAddress(),
        nominee: faker.finance.ethereumAddress(),
        registry: faker.finance.ethereumAddress(),
        tokenId: faker.datatype.hexaDecimal(64),
        deadline: Math.ceil(new Date().getTime() / 1000) + 60, // created a deadline 1 minute ahead of current time
        nonce: 0,
      };
      const fakeSig = {
        r: faker.datatype.hexaDecimal(64),
        s: faker.datatype.hexaDecimal(64),
        v: faker.datatype.number(10),
      };

      describe("When registry is paused", () => {
        beforeEach(async () => {
          await fakeRegistryContract.connect(users.carrier).pause();
        });

        it("should revert when calling: transferBeneficiaryWithSig", async () => {
          const tx = titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(fakeEndorsement, fakeSig);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowContractAsBeneficiary, "RegistryContractPaused");
        });

        it("should revert when calling: cancelBeneficiaryTransfer", async () => {
          const tx = titleEscrowContractAsBeneficiary.cancelBeneficiaryTransfer(fakeEndorsement);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowContractAsBeneficiary, "RegistryContractPaused");
        });
      });

      describe("When title escrow is inactive", () => {
        beforeEach(async () => {
          await titleEscrowContract
            .connect(users.holder)
            .transferHolder(users.beneficiary.address, txnRemarks.holderTransferRemark);
          await titleEscrowContract.connect(users.beneficiary).surrender(txnRemarks.surrenderRemark);
          await titleEscrowContract.connect(registrySigner as Signer).shred(txnRemarks.burnRemark);
        });

        it("should revert when calling: transferBeneficiaryWithSig", async () => {
          const tx = titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(fakeEndorsement, fakeSig);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowContractAsBeneficiary, "InactiveTitleEscrow");
        });

        it("should revert when calling: cancelBeneficiaryTransfer", async () => {
          const tx = titleEscrowContractAsBeneficiary.cancelBeneficiaryTransfer(fakeEndorsement);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowContractAsBeneficiary, "InactiveTitleEscrow");
        });
      });

      describe("When title escrow is not holding token", () => {
        beforeEach(async () => {
          await titleEscrowContract
            .connect(users.holder)
            .transferHolder(users.beneficiary.address, txnRemarks.holderTransferRemark);
          await titleEscrowContract.connect(users.beneficiary).surrender(txnRemarks.surrenderRemark);
        });

        it("should revert when calling: transferBeneficiaryWithSig", async () => {
          const tx = titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(fakeEndorsement, fakeSig);

          await expect(tx).to.be.revertedWithCustomError(
            titleEscrowContractAsBeneficiary,
            "TitleEscrowNotHoldingToken"
          );
        });

        it("should call cancelBeneficiaryTransfer successfully", async () => {
          fakeEndorsement.holder = users.holder.address;
          const tx = titleEscrowContract.connect(users.holder).cancelBeneficiaryTransfer(fakeEndorsement);

          await expect(tx).to.not.be.reverted;
        });
      });
    });

    describe("Transfer Beneficiary with Signature", () => {
      let endorsement: BeneficiaryTransferData;
      let nominee: SignerWithAddress;
      let sig: Signature;
      let hashStruct: string;

      const beneficiaryTransferTypes = {
        BeneficiaryTransfer: [
          { name: "beneficiary", type: "address" },
          { name: "holder", type: "address" },
          { name: "nominee", type: "address" },
          { name: "registry", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      };

      beforeEach(async () => {
        [nominee] = users.others;

        endorsement = {
          beneficiary: users.beneficiary.address,
          holder: users.holder.address,
          nominee: nominee.address,
          registry: fakeRegistryContract.address,
          tokenId: fakeTokenId,
          deadline: Math.floor(Date.now() / 1000) + 3600 * 24,
          nonce: 0,
        };

        const sigHash = await users.holder._signTypedData(domain, beneficiaryTransferTypes, endorsement);
        sig = ethers.utils.splitSignature(sigHash);

        hashStruct = ethers.utils.keccak256(
          ethers.utils.defaultAbiCoder.encode(
            ["bytes32", ...beneficiaryTransferTypes.BeneficiaryTransfer.map((obj) => obj.type)],
            [
              ethers.utils.id(
                "BeneficiaryTransfer(address beneficiary,address holder,address nominee,address registry,uint256 tokenId,uint256 deadline,uint256 nonce)"
              ),
              ...Object.values(endorsement),
            ]
          )
        );
      });

      describe("Beneficiary Transfer: transferBeneficiaryWithSig", () => {
        describe("When Beneficiary Transfer signature is invalid", () => {
          it("should revert when caller is not a beneficiary", async () => {
            const tx = titleEscrowContract.connect(users.holder).transferBeneficiaryWithSig(endorsement, sig);

            await expect(tx).to.be.revertedWithCustomError(titleEscrowContract, "CallerNotBeneficiary");
          });

          it("should revert if endorsed nominee is zero address", async () => {
            endorsement.nominee = ethers.constants.AddressZero;

            const tx = titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(endorsement, sig);

            await expect(tx).to.be.revertedWithCustomError(titleEscrowContractAsBeneficiary, "InvalidEndorsement");
          });

          it("should revert if endorsed nominee is same as beneficiary address", async () => {
            endorsement.nominee = users.beneficiary.address;

            const tx = titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(endorsement, sig);

            await expect(tx).to.be.revertedWithCustomError(titleEscrowContractAsBeneficiary, "InvalidEndorsement");
          });

          it("should revert if signer is not holder", async () => {
            endorsement.holder = users.others[faker.datatype.number(users.others.length - 1)].address;

            const tx = titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(endorsement, sig);

            await expect(tx).to.be.revertedWithCustomError(titleEscrowContractAsBeneficiary, "InvalidEndorsement");
          });

          it("should revert if endorsed token ID is in correct", async () => {
            endorsement.tokenId = faker.datatype.hexaDecimal(64);
            const sigHash = await users.holder._signTypedData(domain, beneficiaryTransferTypes, endorsement);
            sig = ethers.utils.splitSignature(sigHash);

            const tx = titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(endorsement, sig);

            await expect(tx).to.be.revertedWithCustomError(titleEscrowContractAsBeneficiary, "InvalidEndorsement");
          });

          it("should revert if endorsed registry is in correct", async () => {
            endorsement.registry = faker.finance.ethereumAddress();
            const sigHash = await users.holder._signTypedData(domain, beneficiaryTransferTypes, endorsement);
            sig = ethers.utils.splitSignature(sigHash);

            const tx = titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(endorsement, sig);

            await expect(tx).to.be.revertedWithCustomError(titleEscrowContractAsBeneficiary, "InvalidEndorsement");
          });

          it("should revert when on-chain nominee is different from endorsed nominee", async () => {
            const [, invalidNominee] = users.others;
            await titleEscrowContractAsBeneficiary.nominate(invalidNominee.address, txnRemarks.nominateRemark);
            const onChainNominee = await titleEscrowContract.nominee();
            assert.isOk(onChainNominee === invalidNominee.address, "Wrong on-chain nominee");

            const tx = titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(endorsement, sig);

            await expect(tx)
              .to.be.revertedWithCustomError(
                titleEscrowContractAsBeneficiary,
                "MismatchedEndorsedNomineeAndOnChainNominee"
              )
              .withArgs(endorsement.nominee, onChainNominee);
          });

          it("should revert if beneficiary in endorsement is different from current beneficiary", async () => {
            endorsement.beneficiary = users.others[faker.datatype.number(users.others.length - 1)].address;

            const tx = titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(endorsement, sig);

            await expect(tx)
              .to.be.revertedWithCustomError(
                titleEscrowContractAsBeneficiary,
                "MismatchedEndorsedBeneficiaryAndCurrentBeneficiary"
              )
              .withArgs(endorsement.beneficiary, users.beneficiary.address);
          });

          it("should revert if signature is expired", async () => {
            endorsement.deadline = Math.floor(Date.now() / 1000) - 3600;
            const sigHash = await users.holder._signTypedData(domain, beneficiaryTransferTypes, endorsement);
            sig = ethers.utils.splitSignature(sigHash);

            const tx = titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(endorsement, sig);

            await expect(tx).to.be.revertedWithCustomError(titleEscrowContractAsBeneficiary, "SignatureExpired");
          });

          it("should revert if nonce is incorrect", async () => {
            endorsement.nonce = faker.datatype.number();
            const sigHash = await users.holder._signTypedData(domain, beneficiaryTransferTypes, endorsement);
            sig = ethers.utils.splitSignature(sigHash);

            const tx = titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(endorsement, sig);

            await expect(tx).to.be.revertedWithCustomError(titleEscrowContractAsBeneficiary, "InvalidSignature");
          });
        });

        describe("When Beneficiary Transfer signature is valid", () => {
          it("should transfer to nominated beneficiary successfully", async () => {
            await titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(endorsement, sig);
            const res = await titleEscrowContract.beneficiary();

            expect(res).to.equal(nominee.address);
          });

          it("should transfer beneficiary successfully if on-chain nominee is same as endorsed nominee", async () => {
            await titleEscrowContractAsBeneficiary.nominate(nominee.address, txnRemarks.nominateRemark);
            const onChainNominee = await titleEscrowContract.nominee();
            assert.isOk(onChainNominee === nominee.address, "On-chain nominee is different from endorsed nominee");

            await titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(endorsement, sig);
            const res = await titleEscrowContract.beneficiary();

            expect(res).to.equal(nominee.address);
          });

          it("should increase holder nonce value after beneficiary transfer", async () => {
            const initNonce = await titleEscrowContract.nonces(users.holder.address);
            await titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(endorsement, sig);

            const currentNonce = await titleEscrowContract.nonces(users.holder.address);

            expect(Number(currentNonce)).to.be.greaterThan(Number(initNonce));
          });

          it("should revert if Beneficiary Transfer is cancelled", async () => {
            await titleEscrowContract.connect(users.holder).cancelBeneficiaryTransfer(endorsement);
            const cancelStatus = await titleEscrowContract.cancelled(hashStruct);
            assert.isOk(cancelStatus, "Beneficiary Transfer is not cancelled");

            const tx = titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(endorsement, sig);

            await expect(tx).to.be.revertedWithCustomError(
              titleEscrowContractAsBeneficiary,
              "SignatureAlreadyCancelled"
            );
          });
        });

        describe("Beneficiary Transfer Cancellation", () => {
          let titleEscrowContractAsEndorsingHolder: TitleEscrowSignable;

          beforeEach(async () => {
            titleEscrowContractAsEndorsingHolder = titleEscrowContract.connect(users.holder);
          });

          it("should revert if caller is not holder who initiated endorsement", async () => {
            const invalidHolder = users.others[faker.datatype.number(users.others.length - 1)];

            const tx = titleEscrowContract.connect(invalidHolder).cancelBeneficiaryTransfer(endorsement);

            await expect(tx).to.be.revertedWithCustomError(titleEscrowContract, "CallerNotEndorser");
          });

          it("should add correct hash to cancel", async () => {
            const initStatus = await titleEscrowContract.cancelled(hashStruct);
            assert.isOk(!initStatus, "Initial cancel status should be false");

            await titleEscrowContractAsEndorsingHolder.cancelBeneficiaryTransfer(endorsement);

            const res = await titleEscrowContract.cancelled(hashStruct);

            expect(res).to.be.true;
          });

          it("should emit CancelBeneficiaryTransferEndorsement event", async () => {
            const tx = await titleEscrowContractAsEndorsingHolder.cancelBeneficiaryTransfer(endorsement);

            expect(tx)
              .to.emit(titleEscrowContractAsBeneficiary, "CancelBeneficiaryTransferEndorsement")
              .withArgs(hashStruct, users.holder.address, fakeTokenId);
          });
        });
      });

      describe("When transferring holder", () => {
        let newHolder: SignerWithAddress;

        beforeEach(async () => {
          newHolder = users.others[faker.datatype.number(users.others.length - 1)];
        });

        it("should increase nonce of previous holder", async () => {
          const initNonce = await titleEscrowContract.nonces(users.holder.address);

          await titleEscrowContract
            .connect(users.holder)
            .transferHolder(newHolder.address, txnRemarks.holderTransferRemark);
          const currentNonce = await titleEscrowContract.nonces(users.holder.address);

          expect(Number(currentNonce)).to.be.greaterThan(Number(initNonce));
        });

        it("should not alter the nonce of new holder", async () => {
          const initNonce = await titleEscrowContract.nonces(newHolder.address);

          await titleEscrowContract
            .connect(users.holder)
            .transferHolder(newHolder.address, txnRemarks.holderTransferRemark);
          const currentNonce = await titleEscrowContract.nonces(newHolder.address);

          expect(initNonce).to.equal(currentNonce);
        });

        it("should render existing signatures from previous holder invalid", async () => {
          endorsement.holder = newHolder.address;
          const sigHash = await users.holder._signTypedData(domain, beneficiaryTransferTypes, endorsement);
          sig = ethers.utils.splitSignature(sigHash);
          await titleEscrowContract
            .connect(users.holder)
            .transferHolder(newHolder.address, txnRemarks.holderTransferRemark);

          const tx = titleEscrowContractAsBeneficiary.transferBeneficiaryWithSig(endorsement, sig);

          await expect(tx).to.be.revertedWithCustomError(titleEscrowContractAsBeneficiary, "InvalidSignature");
        });
      });
    });
  });
});
