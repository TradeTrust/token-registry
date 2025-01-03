import { ethers as packedEthers } from "ethers";

const ethers = { ...packedEthers };

if (ethers.version.includes("/5")) {
  (ethers as any).id = (ethers as any).utils.id;
  (ethers as any).ZeroHash = (ethers as any).constants.HashZero;
}

export const roleHash = {
  DefaultAdmin: (ethers as any).ZeroHash,
  MinterRole: (ethers as any).id("MINTER_ROLE"),
  AccepterRole: (ethers as any).id("ACCEPTER_ROLE"),
  RestorerRole: (ethers as any).id("RESTORER_ROLE"),
  MinterAdminRole: (ethers as any).id("MINTER_ADMIN_ROLE"),
  AccepterAdminRole: (ethers as any).id("ACCEPTER_ADMIN_ROLE"),
  RestorerAdminRole: (ethers as any).id("RESTORER_ADMIN_ROLE"),
};
