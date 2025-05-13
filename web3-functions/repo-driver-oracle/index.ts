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
    "OwnerUpdateRequested(uint256 indexed accountId, uint8 forge, bytes nameBytes, address payer)");
  const updateOwnerByGelato = FunctionFragment.from(
    "updateOwnerByGelato(uint256 accountId, address owner, address payer)");
  const repoDriverInterface = new Interface([ownerUpdateRequested, updateOwnerByGelato]);

  const forgeGitHub = 0;
  const forgeGitLab = 1;
  const forgeOrcid = 2;
  const forgeWebsite = 3;

  const repoDriver = context.log.address;
  const {accountId, forge, nameBytes, payer}  = repoDriverInterface.parseLog(context.log).args;
  const chain = {
    31337:     "gelato-local-test",
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
    324:       "zksync",
    300:       "zksync-sepolia",
    534352:    "scroll",
    534351:    "scroll-sepolia",
  }[context.gelatoArgs.chainId] ?? "other";

  let owner;
  let name;
  let error;
  try {
    name = toUtf8String(nameBytes);
    if(forge == forgeOrcid){
      const id = name.replace(/^sandbox-/, "");
      const subdomain = id !== name ? ".sandbox" : "";
      const url = `https://pub${subdomain}.orcid.org/v3.0/${id}/researcher-urls`;
      const json = await ky.get(url, {timeout: 4_000}).json();
      const owners = json["researcher-url"]
        .filter((urlItem) => urlItem["url-name"] === "DRIPS_OWNERSHIP_CLAIM")
        .map((urlItem) => urlItem.url?.value)
        .filter((urlString) => URL.canParse(urlString))
        .map((urlString) => new URL(urlString))
        .filter((url) => url.href === `http://0.0.0.0/${url.search}`)
        .flatMap((url) => url.searchParams.getAll(chain.replaceAll("-", "_")));
      if(owners.length != 1) throw `Found ${owners.length} ownership declarations`;
      owner = getAddress(owners[0]);
    }
    else {
      let url;
      if(forge === forgeGitHub) url = `https://raw.githubusercontent.com/${name}/HEAD/FUNDING.json`;
      else if(forge === forgeGitLab) url = `https://gitlab.com/${name}/-/raw/HEAD/FUNDING.json`;
      else if(forge === forgeWebsite) url = `https://${name}/FUNDING.json`;
      else throw Error(`Unknown forge ${forge}`);
      const afterResponseHook = async (_request, _options, response) => {
        // Ensure that the entire body has been transferred and no network failure can occur.
        await response.clone().arrayBuffer();
        // Got a valid response, from now on any failure will be considered an ownership revocation.
        if(response.ok || response.status === 403 || response.status === 404) owner = AddressZero;
      }
      const getOptions = {timeout: 4_000, hooks: {afterResponse: [afterResponseHook]}};
      const json = await ky.get(url, getOptions).json();
      owner = getAddress(json.drips[chain].ownedBy)
    }
  } catch (error_) {
    error = error_;
  }

  console.log("Forge:", forge);
  console.log("Name:", name || "<malformed UTF-8>");
  console.log("Name bytes:", nameBytes);
  console.log("Account ID:", accountId.toString());
  console.log("Owner:", owner || "<unchanged>");
  console.log("Payer:", payer);
  if(error) console.log("Error:", error)

  if(!owner) return { canExec: false, message: "Owner unchanged" };
  const functionData = repoDriverInterface.encodeFunctionData(
    updateOwnerByGelato, [accountId, owner, payer]);
  const functionCall = { to: repoDriver, data: functionData };
  return { canExec: true, callData: [functionCall] };
});
