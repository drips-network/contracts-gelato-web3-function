import {
  Web3Function,
  Web3FunctionEventContext,
} from "@gelatonetwork/web3-functions-sdk";
import { EventFragment, FunctionFragment, Interface } from "@ethersproject/abi";
import { getAddress } from "@ethersproject/address";
import { AddressZero } from "@ethersproject/constants";
import { toUtf8String } from "@ethersproject/strings";
import ky from "ky";

Web3Function.onRun(async (context: Web3FunctionEventContext) => {
  const ownerUpdateRequested = EventFragment.from(
    "OwnerUpdateRequested(uint256 indexed accountId, uint8 forge, bytes name, address payer)");
  const updateOwnerByGelato = FunctionFragment.from(
    "updateOwnerByGelato(uint256 accountId, address owner, uint96 fromBlock, address payer)");
  const repoDriverInterface = new Interface([ownerUpdateRequested, updateOwnerByGelato]);

  const {address: repoDriver, blockNumber: fromBlock} = context.log;
  const {accountId, forge, name, payer}  = repoDriverInterface.parseLog(context.log).args;
  const chain = {
    1:         "ethereum",
    11155111:  "sepolia",
    10:        "optimism",
    11155420:  "optimism-sepolia",
    56:        "bsc",
    97:        "bsc-testnet",
    137:       "polygon",
    80002:     "amoy",
    100:       "gnosis",
    10200:     "chiado",
    314:       "filecoin",
    314159:    "calibration",
    1101:      "polygon-zkevm",
    2442:      "cardona",
    1088:      "metis",
    59902:     "metis-sepolia",
    1284:      "moonbeam",
    1285:      "moonriver",
    3776:      "astar-zkevm",
    6038361:   "zkyoto",
    8453:      "base",
    84532:     "base-sepolia",
    34443:     "mode",
    919:       "mode-sepolia",
    42161:     "arbitrum",
    421614:    "arbitrum-sepolia",
    59144:     "linea",
    59141:     "linea-sepolia",
    81457:     "blast",
    168587773: "blast-sepolia",
  }[context.gelatoArgs.chainId] ?? "other";

  let owner = AddressZero;
  let repoName = "<malformed UTF-8>";
  let error;
  try {
    repoName = toUtf8String(name);
    let url: string;
    switch(forge) {
      case 0:
        url = `https://raw.githubusercontent.com/${repoName}/HEAD/FUNDING.json`;
        break;
      case 1:
        url = `https://gitlab.com/${repoName}/-/raw/HEAD/FUNDING.json`;
        break;
      default:
        throw Error(`Unknown forge ${forge}`);
    }
    const funding: any = await ky.get(url, { timeout: 25_000, retry: 10 }).json();
    owner = getAddress(funding.drips[chain].ownedBy);
  } catch (error_) {
    error = error_;
  }

  const functionData = repoDriverInterface.encodeFunctionData(
    updateOwnerByGelato, [accountId, owner, fromBlock, payer]);
  const functionCall = { to: repoDriver, data: functionData };

  console.log("Owner:", owner);
  console.log("Account ID:", accountId.toString());
  console.log("Repo forge:", forge);
  console.log("Repo name:", name);
  console.log("Repo name as UTF-8:", repoName);
  console.log("Payer:", payer);
  console.log("Requested from block:", fromBlock);
  if(error) console.log("Error:", error)

  return { canExec: true, callData: [functionCall] };
});
