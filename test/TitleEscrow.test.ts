import { ethers, waffle } from "hardhat";
import { ERC721, TitleEscrow, TradeTrustERC721, TradeTrustERC721Mock } from "@tradetrust/contracts";
import faker from "faker";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from ".";
import { deployTokenFixture, mintTokenFixture } from "./fixtures";
import { getTestUsers, getTitleEscrowContract, TestUsers } from "./utils";
import { deployTitleEscrowFixture } from "./fixtures/deploy-title-escrow.fixture";

const { loadFixture } = waffle;

describe.only("Title Escrow", async () => {
  let users: TestUsers;

  let tokenId: string;

  beforeEach(async () => {
    users = await getTestUsers();
    tokenId = faker.datatype.hexaDecimal(64);
  });

  describe("Receiving Token", () => {
    let deployer: SignerWithAddress;
    let titleEscrowContract: TitleEscrow;

    beforeEach(async () => {
      users = await getTestUsers();

      deployer = users.others[users.others.length - 1];
      titleEscrowContract = await loadFixture(deployTitleEscrowFixture({ deployer }));
      tokenId = faker.datatype.hexaDecimal(64);
    });

    describe("Initialisation", () => {
      let fakeRegistryAddress: string;

      beforeEach(async () => {
        fakeRegistryAddress = ethers.utils.getAddress(faker.finance.ethereumAddress());

        await titleEscrowContract.initialize(
          fakeRegistryAddress,
          users.beneficiary.address,
          users.holder.address,
          tokenId
        );
      });

      it("should be initialised with the correct registry address", async () => {
        expect(await titleEscrowContract.registry()).to.equal(fakeRegistryAddress);
      });

      it("should initialise with the correct beneficiary address", async () => {
        expect(await titleEscrowContract.beneficiary()).to.equal(users.beneficiary.address);
      });

      it("should initialise with the correct holder address", async () => {
        expect(await titleEscrowContract.holder()).to.equal(users.holder.address);
      });

      it("should initialise with the correct token ID", async () => {
        expect(await titleEscrowContract.tokenId()).to.equal(tokenId);
      });

      it("should initialise beneficiary nominee with zero", async () => {
        expect(await titleEscrowContract.nominatedBeneficiary()).to.equal(ethers.constants.AddressZero);
      });

      it("should initialise holder nominee with zero", async () => {
        expect(await titleEscrowContract.nominatedHolder()).to.equal(ethers.constants.AddressZero);
      });
    });

    describe("IERC721Receiver Behaviour", () => {
      let fakeAddress: string;
      let fakeRegistry: SignerWithAddress;

      beforeEach(async () => {
        fakeAddress = ethers.utils.getAddress(faker.finance.ethereumAddress());
        [fakeRegistry] = users.others;
      });

      it("should only be able to receive designated token ID", async () => {
        const wrongTokenId = faker.datatype.hexaDecimal(64);
        await titleEscrowContract.initialize(fakeAddress, users.beneficiary.address, users.holder.address, tokenId);

        const tx = titleEscrowContract.onERC721Received(fakeAddress, fakeAddress, wrongTokenId, "0x00");

        await expect(tx).to.be.revertedWith("TitleEscrow: Unable to accept token");
      });

      it("should only be able to receive from designated registry", async () => {
        const [, fakeWrongRegistry] = users.others;
        await titleEscrowContract.initialize(
          fakeRegistry.address,
          users.beneficiary.address,
          users.holder.address,
          tokenId
        );

        const tx = titleEscrowContract
          .connect(fakeWrongRegistry)
          .onERC721Received(fakeAddress, fakeAddress, tokenId, "0x00");

        await expect(tx).to.be.revertedWith("TitleEscrow: Only tokens from predefined token registry can be accepted");
      });

      it("should emit TokenReceived event when successfully receiving token", async () => {
        await titleEscrowContract.initialize(
          fakeRegistry.address,
          users.beneficiary.address,
          users.holder.address,
          tokenId
        );

        const tx = await titleEscrowContract
          .connect(fakeRegistry)
          .onERC721Received(fakeAddress, fakeAddress, tokenId, "0x00");

        expect(tx).to.emit(titleEscrowContract, "TokenReceived").withArgs(fakeRegistry.address, tokenId);
      });
    });

    describe("Is Holding Token Status", () => {
      let registryContract: TradeTrustERC721;
      let titleEscrowOwnerContract: TitleEscrow;

      beforeEach(async () => {
        registryContract = await loadFixture(
          deployTokenFixture<TradeTrustERC721>({
            tokenContractName: "TradeTrustERC721",
            tokenName: "The Great Shipping Company",
            tokenInitials: "GSC",
            deployer: users.carrier,
          })
        );
        await registryContract
          .connect(users.carrier)
          .mintTitle(users.beneficiary.address, users.beneficiary.address, tokenId);
        titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, tokenId);
      });

      it("should return true when holding token", async () => {
        const res = await titleEscrowOwnerContract.isHoldingToken();

        expect(res).to.be.true;
      });

      it("should return false when not holding token", async () => {
        await titleEscrowOwnerContract.connect(users.beneficiary).surrender();

        const res = await titleEscrowOwnerContract.isHoldingToken();

        expect(res).to.be.false;
      });
    });
  });

  describe.only("Nomination and Endorsement", () => {
    let registryContract: TradeTrustERC721;
    let titleEscrowOwnerContract: TitleEscrow;

    beforeEach(async () => {
      registryContract = await loadFixture(
        deployTokenFixture<TradeTrustERC721>({
          tokenContractName: "TradeTrustERC721",
          tokenName: "The Great Shipping Company",
          tokenInitials: "GSC",
          deployer: users.carrier,
        })
      );

      await registryContract.connect(users.carrier).mintTitle(users.beneficiary.address, users.holder.address, tokenId);
      titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, tokenId);
    });

    describe("Nomination", () => {
      describe("Beneficiary Nomination", () => {
        let beneficiaryNominee: SignerWithAddress;

        beforeEach(async () => {
          [beneficiaryNominee] = users.others;
        });

        it("should allow beneficiary to nominate a new beneficiary", async () => {
          await titleEscrowOwnerContract.connect(users.beneficiary).nominateBeneficiary(beneficiaryNominee.address);
          const res = await titleEscrowOwnerContract.nominatedBeneficiary();

          expect(res).to.equal(beneficiaryNominee.address);
        });

        it("should allow beneficiary to revoke beneficiary nomination", async () => {
          await titleEscrowOwnerContract.connect(users.beneficiary).nominateBeneficiary(beneficiaryNominee.address);
          const initialNominee = await titleEscrowOwnerContract.nominatedBeneficiary();
          await titleEscrowOwnerContract.connect(users.beneficiary).nominateBeneficiary(ethers.constants.AddressZero);
          const revokedNominee = await titleEscrowOwnerContract.nominatedBeneficiary();

          expect(initialNominee).to.equal(beneficiaryNominee.address);
          expect(revokedNominee).to.equal(ethers.constants.AddressZero);
        });

        it("should not allow a non-beneficiary to nominate beneficiary", async () => {
          const tx = titleEscrowOwnerContract.connect(users.holder).nominateBeneficiary(beneficiaryNominee.address);

          await expect(tx).to.be.revertedWith("TitleEscrow: Caller is not beneficiary");
        });

        it("should not allow nominating an existing beneficiary", async () => {
          const tx = titleEscrowOwnerContract.connect(users.beneficiary).nominateBeneficiary(users.beneficiary.address);

          await expect(tx).to.be.revertedWith("TitleEscrow: Nominee is already beneficiary");
        });

        it("should not allow nominating an address who is already a beneficiary nominee", async () => {
          const titleEscrowAsBeneficiary = titleEscrowOwnerContract.connect(users.beneficiary);
          await titleEscrowAsBeneficiary.nominateBeneficiary(beneficiaryNominee.address);

          const tx = titleEscrowAsBeneficiary.nominateBeneficiary(beneficiaryNominee.address);

          await expect(tx).to.be.revertedWith("TitleEscrow: Beneficiary nominee is already nominated");
        });

        it("should not allow to nominate beneficiary when title escrow is not holding token", async () => {
          tokenId = faker.datatype.hexaDecimal(64);
          await registryContract
            .connect(users.carrier)
            .mintTitle(users.beneficiary.address, users.beneficiary.address, tokenId);
          const titleEscrowAsBeneficiary = (await getTitleEscrowContract(registryContract, tokenId)).connect(
            users.beneficiary
          );
          await titleEscrowAsBeneficiary.surrender();

          const tx = titleEscrowAsBeneficiary.nominateBeneficiary(beneficiaryNominee.address);

          await expect(tx).to.be.revertedWith("TitleEscrow: Not holding token");
        });

        it("should emit BeneficiaryNomination event", async () => {
          const tx = await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominateBeneficiary(beneficiaryNominee.address);

          expect(tx)
            .to.emit(titleEscrowOwnerContract, "BeneficiaryNomination")
            .withArgs(registryContract.address, tokenId, beneficiaryNominee.address, users.beneficiary.address);
        });
      });

      describe("Holder Nomination", () => {
        let holderNominee: SignerWithAddress;

        beforeEach(async () => {
          [holderNominee] = users.others;
        });

        it("should allow beneficiary to nominate a new holder", async () => {
          await titleEscrowOwnerContract.connect(users.beneficiary).nominateHolder(holderNominee.address);
          const res = await titleEscrowOwnerContract.nominatedHolder();

          expect(res).to.equal(holderNominee.address);
        });

        it("should allow beneficiary to revoke holder nomination", async () => {
          await titleEscrowOwnerContract.connect(users.beneficiary).nominateHolder(holderNominee.address);
          const initialNominee = await titleEscrowOwnerContract.nominatedHolder();

          await titleEscrowOwnerContract.connect(users.beneficiary).nominateHolder(ethers.constants.AddressZero);
          const revokedNominee = await titleEscrowOwnerContract.nominatedHolder();

          expect(initialNominee).to.equal(holderNominee.address);
          expect(revokedNominee).to.equal(ethers.constants.AddressZero);
        });

        it("should not allow a non-beneficiary to nominate holder", async () => {
          const tx = titleEscrowOwnerContract.connect(users.holder).nominateHolder(holderNominee.address);

          await expect(tx).to.be.revertedWith("TitleEscrow: Caller is not beneficiary");
        });

        it("should not allow nominating an existing holder", async () => {
          const tx = titleEscrowOwnerContract.connect(users.beneficiary).nominateHolder(users.holder.address);

          await expect(tx).to.be.revertedWith("TitleEscrow: Nominee is already holder");
        });

        it("should not allow nominating an address who is already a holder nominee", async () => {
          const titleEscrowAsBeneficiary = titleEscrowOwnerContract.connect(users.beneficiary);
          await titleEscrowAsBeneficiary.nominateHolder(holderNominee.address);

          const tx = titleEscrowAsBeneficiary.nominateHolder(holderNominee.address);

          await expect(tx).to.be.revertedWith("TitleEscrow: Holder nominee is already nominated");
        });

        it("should not allow to nominate holder when title escrow is not holding token", async () => {
          tokenId = faker.datatype.hexaDecimal(64);
          await registryContract
            .connect(users.carrier)
            .mintTitle(users.beneficiary.address, users.beneficiary.address, tokenId);
          const titleEscrowAsBeneficiary = (await getTitleEscrowContract(registryContract, tokenId)).connect(
            users.beneficiary
          );
          await titleEscrowAsBeneficiary.surrender();

          const tx = titleEscrowAsBeneficiary.nominateHolder(holderNominee.address);

          await expect(tx).to.be.revertedWith("TitleEscrow: Not holding token");
        });

        it("should emit HolderNomination event", async () => {
          const tx = await titleEscrowOwnerContract.connect(users.beneficiary).nominateHolder(holderNominee.address);

          expect(tx)
            .to.emit(titleEscrowOwnerContract, "HolderNomination")
            .withArgs(registryContract.address, tokenId, holderNominee.address, users.beneficiary.address);
        });
      });

      describe("Nominate Beneficiary and Holder", () => {
        let beneficiaryNominee: SignerWithAddress;
        let holderNominee: SignerWithAddress;

        beforeEach(async () => {
          [beneficiaryNominee, holderNominee] = users.others;
        });

        it("should call nominateBeneficiary and nominateHolder", async () => {
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(beneficiaryNominee.address, holderNominee.address);
          const [nominatedBeneficiary, nominatedHolder] = await Promise.all([
            titleEscrowOwnerContract.nominatedBeneficiary(),
            titleEscrowOwnerContract.nominatedHolder(),
          ]);

          expect(nominatedBeneficiary).to.equal(beneficiaryNominee.address);
          expect(nominatedHolder).to.equal(holderNominee.address);
        });

        it("should revert when caller is not beneficiary", async () => {
          const tx = titleEscrowOwnerContract
            .connect(users.holder)
            .nominate(beneficiaryNominee.address, holderNominee.address);

          await expect(tx).to.be.revertedWith("TitleEscrow: Caller is not beneficiary");
        });

        it("should emit BeneficiaryEndorsement and HolderEndorsement events", async () => {
          const tx = await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(beneficiaryNominee.address, holderNominee.address);

          expect(tx)
            .to.emit(titleEscrowOwnerContract, "BeneficiaryNomination")
            .withArgs(registryContract.address, tokenId, beneficiaryNominee.address, users.beneficiary.address);
          expect(tx)
            .to.emit(titleEscrowOwnerContract, "HolderNomination")
            .withArgs(registryContract.address, tokenId, holderNominee.address, users.beneficiary.address);
        });
      });
    });

    describe("Endorsement", () => {
      describe("Beneficiary Endorsement", () => {
        let beneficiaryNominee: SignerWithAddress;

        beforeEach(async () => {
          [beneficiaryNominee] = users.others;
        });

        it("should allow holder to endorse a nominated beneficiary", async () => {
          await titleEscrowOwnerContract.connect(users.beneficiary).nominateBeneficiary(beneficiaryNominee.address);

          await titleEscrowOwnerContract.connect(users.holder).endorseBeneficiary(beneficiaryNominee.address);
          const res = await titleEscrowOwnerContract.beneficiary();

          expect(res).to.equal(beneficiaryNominee.address);
        });

        it("should allow a beneficiary who is also a holder to endorse a non-nominated beneficiary", async () => {
          const fakeTokenId = faker.datatype.hexaDecimal(64);
          const [targetNonNominatedBeneficiary] = users.others;
          await registryContract
            .connect(users.carrier)
            .mintTitle(users.beneficiary.address, users.beneficiary.address, fakeTokenId);
          titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, fakeTokenId);

          const initialBeneficiaryNominee = await titleEscrowOwnerContract.nominatedBeneficiary();
          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .endorseBeneficiary(targetNonNominatedBeneficiary.address);
          const currentBeneficiary = await titleEscrowOwnerContract.beneficiary();

          expect(initialBeneficiaryNominee).to.equal(ethers.constants.AddressZero);
          expect(currentBeneficiary).to.equal(targetNonNominatedBeneficiary.address);
        });

        it("should not allow non-holder to endorse a nominated beneficiary", async () => {
          await titleEscrowOwnerContract.connect(users.beneficiary).nominateBeneficiary(beneficiaryNominee.address);

          const tx = titleEscrowOwnerContract.connect(users.beneficiary).endorseBeneficiary(beneficiaryNominee.address);

          await expect(tx).to.be.revertedWith("TitleEscrow: Caller is not holder");
        });

        it("should not allow endorsing zero address", async () => {
          const tx = titleEscrowOwnerContract.connect(users.holder).endorseBeneficiary(ethers.constants.AddressZero);

          await expect(tx).to.be.revertedWith("TitleEscrow: Cannot endorse address");
        });

        it("should not allow endorsing a non-nominated beneficiary", async () => {
          const fakeNonNominee = faker.finance.ethereumAddress();
          await titleEscrowOwnerContract.connect(users.beneficiary).nominateBeneficiary(beneficiaryNominee.address);

          const tx = titleEscrowOwnerContract.connect(users.holder).endorseBeneficiary(fakeNonNominee);

          await expect(tx).to.be.revertedWith("TitleEscrow: Cannot endorse non-nominee");
        });

        it("should reset nominated beneficiary", async () => {
          await titleEscrowOwnerContract.connect(users.beneficiary).nominateBeneficiary(beneficiaryNominee.address);

          await titleEscrowOwnerContract.connect(users.holder).endorseBeneficiary(beneficiaryNominee.address);
          const res = await titleEscrowOwnerContract.nominatedBeneficiary();

          await expect(res).to.equal(ethers.constants.AddressZero);
        });

        it("should emit BeneficiaryEndorsement event", async () => {
          await titleEscrowOwnerContract.connect(users.beneficiary).nominateBeneficiary(beneficiaryNominee.address);

          const tx = await titleEscrowOwnerContract
            .connect(users.holder)
            .endorseBeneficiary(beneficiaryNominee.address);

          expect(tx)
            .to.emit(titleEscrowOwnerContract, "BeneficiaryEndorsement")
            .withArgs(registryContract.address, tokenId, beneficiaryNominee.address, users.holder.address);
        });
      });

      describe("Holder Endorsement", () => {
        let holderNominee: SignerWithAddress;

        beforeEach(async () => {
          [holderNominee] = users.others;
        });

        it("should allow a holder to endorse a nominated holder", async () => {
          await titleEscrowOwnerContract.connect(users.beneficiary).nominateHolder(holderNominee.address);

          await titleEscrowOwnerContract.connect(users.holder).endorseHolder(holderNominee.address);
          const res = await titleEscrowOwnerContract.holder();

          expect(res).to.equal(holderNominee.address);
        });

        it("should allow a holder who is also a beneficiary to endorse a non-nominated holder", async () => {
          const fakeTokenId = faker.datatype.hexaDecimal(64);
          const [targetNonNominatedHolder] = users.others;
          await registryContract
            .connect(users.carrier)
            .mintTitle(users.beneficiary.address, users.beneficiary.address, fakeTokenId);
          titleEscrowOwnerContract = await getTitleEscrowContract(registryContract, fakeTokenId);

          const initialBeneficiaryNominee = await titleEscrowOwnerContract.nominatedBeneficiary();
          await titleEscrowOwnerContract.connect(users.beneficiary).endorseHolder(targetNonNominatedHolder.address);
          const currentHolder = await titleEscrowOwnerContract.holder();

          expect(initialBeneficiaryNominee).to.equal(ethers.constants.AddressZero);
          expect(currentHolder).to.equal(targetNonNominatedHolder.address);
        });

        it("should allow a holder to endorse anyone as new holder when there is no holder nomination", async () => {
          const targetNewHolder = ethers.utils.getAddress(faker.finance.ethereumAddress());
          const initialHolderNominee = await titleEscrowOwnerContract.nominatedHolder();

          await titleEscrowOwnerContract.connect(users.holder).endorseHolder(targetNewHolder);
          const currentHolder = await titleEscrowOwnerContract.holder();

          expect(initialHolderNominee).to.equal(ethers.constants.AddressZero);
          expect(currentHolder).to.equal(targetNewHolder);
        });

        it("should not allow a holder to endorse anyone as new holder when there is an existing holder nomination", async () => {
          const targetNewHolder = ethers.utils.getAddress(faker.finance.ethereumAddress());
          await titleEscrowOwnerContract.connect(users.beneficiary).nominateHolder(holderNominee.address);
          const initialHolderNominee = await titleEscrowOwnerContract.nominatedHolder();

          const tx = titleEscrowOwnerContract.connect(users.holder).endorseHolder(targetNewHolder);

          expect(initialHolderNominee).to.equal(holderNominee.address);
          await expect(tx).to.be.revertedWith("TitleEscrow: Cannot endorse non-nominee");
        });

        it("should not allow a non-holder to endorse a nominated holder", async () => {
          const tx = titleEscrowOwnerContract.connect(users.beneficiary).endorseHolder(holderNominee.address);

          await expect(tx).to.be.revertedWith("TitleEscrow: Caller is not holder");
        });

        it("should not allow endorsing zero address", async () => {
          const tx = titleEscrowOwnerContract.connect(users.holder).endorseHolder(ethers.constants.AddressZero);

          await expect(tx).to.be.revertedWith("TitleEscrow: Cannot endorse address");
        });

        it("should not allow endorsing a non-nominated beneficiary", async () => {
          const fakeNonNominee = faker.finance.ethereumAddress();
          await titleEscrowOwnerContract.connect(users.beneficiary).nominateHolder(holderNominee.address);

          const tx = titleEscrowOwnerContract.connect(users.holder).endorseHolder(fakeNonNominee);

          await expect(tx).to.be.revertedWith("TitleEscrow: Cannot endorse non-nominee");
        });

        it("should not allow endorsing an existing holder", async () => {
          const tx = titleEscrowOwnerContract.connect(users.holder).endorseHolder(users.holder.address);

          await expect(tx).to.be.revertedWith("TitleEscrow: Endorsee is already holder");
        });

        it("should reset nominated holder", async () => {
          await titleEscrowOwnerContract.connect(users.beneficiary).nominateHolder(holderNominee.address);

          await titleEscrowOwnerContract.connect(users.holder).endorseHolder(holderNominee.address);
          const res = await titleEscrowOwnerContract.nominatedHolder();

          await expect(res).to.equal(ethers.constants.AddressZero);
        });

        it("should emit HolderEndorsement event", async () => {
          await titleEscrowOwnerContract.connect(users.beneficiary).nominateHolder(holderNominee.address);

          const tx = await titleEscrowOwnerContract.connect(users.holder).endorseHolder(holderNominee.address);

          expect(tx)
            .to.emit(titleEscrowOwnerContract, "HolderEndorsement")
            .withArgs(registryContract.address, tokenId, holderNominee.address, users.holder.address);
        });
      });

      describe("Beneficiary and Holder Endorsement", () => {
        let beneficiaryNominee: SignerWithAddress;
        let holderNominee: SignerWithAddress;

        beforeEach(async () => {
          [beneficiaryNominee, holderNominee] = users.others;

          await titleEscrowOwnerContract
            .connect(users.beneficiary)
            .nominate(beneficiaryNominee.address, holderNominee.address);
        });

        it("should call endorseBeneficiary and endorseHolder", async () => {
          await titleEscrowOwnerContract
            .connect(users.holder)
            .endorse(beneficiaryNominee.address, holderNominee.address);
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
            .endorse(beneficiaryNominee.address, holderNominee.address);

          await expect(tx).to.be.revertedWith("TitleEscrow: Caller is not holder");
        });

        it("should emit BeneficiaryEndorsement and HolderEndorsement events", async () => {
          const tx = await titleEscrowOwnerContract
            .connect(users.holder)
            .endorse(beneficiaryNominee.address, holderNominee.address);

          expect(tx)
            .to.emit(titleEscrowOwnerContract, "BeneficiaryEndorsement")
            .withArgs(registryContract.address, tokenId, beneficiaryNominee.address, users.holder.address);
          expect(tx)
            .to.emit(titleEscrowOwnerContract, "HolderEndorsement")
            .withArgs(registryContract.address, tokenId, holderNominee.address, users.holder.address);
        });
      });
    });
  });

  describe("Surrendering", () => {
    it("should only allow a beneficiary who is also a holder to surrender", async () => {});

    it("should only allow surrendering when title escrow is holding token", async () => {});

    it("should not allow a beneficiary only to surrender", async () => {});

    it("should not allow a holder only to surrender", async () => {});

    it("should reset all nominees", async () => {});

    it("should transfer token back to registry", async () => {});

    it("should emit Surrender event", async () => {});
  });

  describe("Shredding", () => {
    it("should only allow to shred when title escrow is not holding token", async () => {});

    it("should allow to be called from registry", async () => {});

    it("should not allow to be called from non-registry", async () => {});

    it("should self destruct", async () => {});

    it("should emit Shred event", async () => {});
  });
});