import { ethers as packedEthers } from "ethers";

const ethers = { ...packedEthers };

if (ethers.version.includes("/5")) {
  (ethers as any).Interface = (ethers as any).utils.Interface;
  (ethers as any).TransactionReceipt = (ethers as any).ContractReceipt;
}

/**
 * Ethers v6, Get event from receipt.logs
 * Ethers v5, Get event from receipt.events
 *
 * @param receipt {TransactionReceipt | ContractReceipt}
 * @param topic {string}
 * @param iface {ethers.Interface | ethers.utils.Interface}
 * @returns
 */
export const getEventFromReceipt = <T extends any>(receipt: any, topic: string, iface: any) => {
  // Check for receipt.events as only ethers V5 tx.wait() returns events object
  // https://ethereum.stackexchange.com/questions/152626/ethers-6-transaction-receipt-events-information
  if (receipt.events) {
    const event = (receipt as any).events.find((evt: any) => evt.topics[0] === topic);
    if (!event) throw new Error(`Cannot find topic ${topic}`);

    if (iface) return iface.parseLog(event) as unknown as T;
    return event as T;
  } else {
    const resLog = receipt.logs.find((log: any) => iface.parseLog(log)?.name === topic);
    return iface.parseLog(resLog as any) as T;
  }
};
