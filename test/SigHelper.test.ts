/* eslint-disable no-underscore-dangle */
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SigHelperMock } from "@tradetrust/contracts";
import { Signature } from "ethers";
import faker from "faker";
import { ethers } from "hardhat";
import { assert, expect } from ".";
import { createDeployFixtureRunner, getTestUsers, TestUsers } from "./helpers";

describe("SigHelper", async () => {
  let users: TestUsers;
  let sender: SignerWithAddress;
  let deployer: SignerWithAddress;

  let sigHelperMock: SigHelperMock;

  const domainName = "Test Name";
  let domain: Record<string, any>;

  let deployFixturesRunner: () => Promise<[SigHelperMock]>;

  // eslint-disable-next-line no-undef
  before(async () => {
    users = await getTestUsers();
    sender = users.carrier;
    [deployer] = users.others;

    deployFixturesRunner = async () =>
      createDeployFixtureRunner(
        (async () => {
          return (await (await ethers.getContractFactory("SigHelperMock"))
            .connect(deployer)
            .deploy(domainName)) as unknown as SigHelperMock;
        })()
      );
  });

  beforeEach(async () => {
    [sigHelperMock] = await loadFixture(deployFixturesRunner);
    sigHelperMock = sigHelperMock.connect(sender);

    const chainId = await sender.provider.getNetwork().then((network) => network.chainId);
    domain = {
      name: domainName,
      version: "1",
      chainId,
      verifyingContract: sigHelperMock.target,
    };
  });

  describe("Initialisation", () => {
    it("should initialise the domain separator correctly", async () => {
      const hashDomain = ethers.TypedDataEncoder.hashDomain(domain);
      await sigHelperMock.__SigHelper_initInternal(domainName, "1");

      const res = await sigHelperMock.DOMAIN_SEPARATOR();

      expect(res).to.equal(hashDomain);
    });
  });

  describe("Cancellation", () => {
    let fakeHash: string;

    beforeEach(async () => {
      fakeHash = ethers.keccak256(ethers.randomBytes(32));
    });

    it("should cancel successfully", async () => {
      const initStatus = await sigHelperMock.cancelled(fakeHash);
      assert.isOk(!initStatus, "Initial status should be false");

      await sigHelperMock.cancelHashInternal(fakeHash);

      const status = await sigHelperMock.cancelled(fakeHash);

      expect(status).to.be.true;
    });

    it("should not cancel an already cancelled hash", async () => {
      await sigHelperMock.cancelHashInternal(fakeHash);
      const initStatus = await sigHelperMock.cancelled(fakeHash);
      assert.isOk(initStatus, "Initial status should be true");

      const tx = sigHelperMock.cancelHashInternal(fakeHash);

      await expect(tx).to.be.rejectedWith(/cancelled/i);
    });
  });

  describe("Validation", () => {
    let hashStruct: string;
    let sigHash: string;
    let sig: Signature;
    let fakeData: {
      types: Record<string, { name: string; type: string }[]>;
      domain: typeof domain;
      message: Record<string, any>;
    };

    beforeEach(async () => {
      fakeData = {
        types: {
          Endorsement: [
            { name: "beneficiary", type: "address" },
            { name: "deadline", type: "uint256" },
          ],
        },
        domain,
        message: {
          beneficiary: faker.finance.ethereumAddress(),
          deadline: Date.now(),
        },
      };

      hashStruct = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "address", "uint256"],
          [
            ethers.id("Endorsement(address beneficiary,uint256 deadline)"),
            fakeData.message.beneficiary,
            fakeData.message.deadline,
          ]
        )
      );
      // hashStruct = ethers.TypedDataEncoder.hash(domain, fakeData.types, {
      //   beneficiary: fakeData.message.beneficiary,
      //   deadline: fakeData.message.deadline,
      // });

      sigHash = await sender.signTypedData(fakeData.domain, fakeData.types, fakeData.message);
      sig = ethers.Signature.from(sigHash);
    });

    it("should return true for a valid signature", async () => {
      const res = await sigHelperMock.validateSigInternal(hashStruct, sender.address, sig);

      expect(res).to.be.true;
    });

    it("should return false for an invalid signature", async () => {
      sigHash = await sender.signTypedData(fakeData.domain, fakeData.types, {
        beneficiary: faker.finance.ethereumAddress(),
        deadline: Date.now(),
      });
      sig = ethers.Signature.from(sigHash);

      const res = await sigHelperMock.validateSigInternal(hashStruct, sender.address, sig);

      expect(res).to.be.false;
    });

    it("should return false if hash has been cancelled", async () => {
      await sigHelperMock.cancelHashInternal(hashStruct);

      const tx = sigHelperMock.validateSigInternal(hashStruct, sender.address, sig);

      await expect(tx).to.be.revertedWithCustomError(sigHelperMock, "SignatureAlreadyCancelled");
    });
  });
});
