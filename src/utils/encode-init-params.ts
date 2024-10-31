import { ethers } from 'ethers';

export interface Params {
  name: string;
  symbol: string;
  deployer: string;
}

export const encodeInitParams = ({ name, symbol, deployer }: Params) => {
  return ethers.AbiCoder.defaultAbiCoder().encode(['string', 'string', 'address'], [name, symbol, deployer]);
};
