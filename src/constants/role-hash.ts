import { ethers } from "ethers";

if (ethers.version.includes("/5")) {
  ethers.id = (ethers as any).utils.id;
  ethers.ZeroHash = (ethers as any).constants.HashZero;
}

export const roleHash = {
  DefaultAdmin: ethers.ZeroHash,
  MinterRole: ethers.id("MINTER_ROLE"),
  AccepterRole: ethers.id("ACCEPTER_ROLE"),
  RestorerRole: ethers.id("RESTORER_ROLE"),
  MinterAdminRole: ethers.id("MINTER_ADMIN_ROLE"),
  AccepterAdminRole: ethers.id("ACCEPTER_ADMIN_ROLE"),
  RestorerAdminRole: ethers.id("RESTORER_ADMIN_ROLE"),
};
