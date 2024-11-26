const ChainId = {
  Ethereum: 1,
  Sepolia: 11155111,
  Polygon: 137,
  PolygonAmoy: 80002,
  XDC: 50,
  XDCApothem: 51,
  HederaMainnet: 295,
  HederaTestnet: 296,
  Stability: 101010,
  StabilityTestnet: 20180427,
};

export const contractAddress = {
  TitleEscrowFactory: {
<<<<<<< HEAD
    [ChainId.Ethereum]: "0x65FC1DbE2EC6BD37Ab01C3Ac3cf235e6Fe793745",
    [ChainId.Sepolia]: "0xfcafea839e576967b96ad1FBFB52b5CA26cd1D25",
    [ChainId.Polygon]: "0xF94f95014304dC45B097439765A4D321bbE165c7",
    [ChainId.PolygonAmoy]: "0x8bbCc8F707DE9ca637f83182215E3BfC53f3e9e1",
    [ChainId.XDC]: "0x9310396503A188E91dfc98fFE90459c25765E639",
    [ChainId.XDCApothem]: "0xca70f36aeeda435c1048fd372bf286a41ac538be",
=======
    [ChainId.Ethereum]: "0xA38CC56c9291B9C1f52F862dd92326d352e710b8",
    [ChainId.Sepolia]: "0xB9d7a127dC96aA1382B6B286E30E7BaDa798CB25",
    [ChainId.Polygon]: "0x5B5F8d94782be18E22420f3276D5ef5a1bc65C53",
    [ChainId.PolygonAmoy]: "0xe54Da2e30B8c83316994bca7A7Aaa8AD762a2866",
    [ChainId.XDC]: "0x50BfCc1b699fD2308B978B7a6A26e3C3Bbad16DC",
    [ChainId.XDCApothem]: "0xce28778bE6cF32ef3Ccbc09910258DF592F3b6F1",
>>>>>>> d1d3e96 (fix: contract address (#26))
    [ChainId.HederaTestnet]: "0x5B5F8d94782be18E22420f3276D5ef5a1bc65C53",
    [ChainId.HederaMainnet]: "0x335ae7ef2a70952d3f7cd4b76f5597067f61157e",
    [ChainId.Stability]: "0x96cc41e7007Dee20eB409586E2e8206d5053219B",
    [ChainId.StabilityTestnet]: "0xAac003619FA8C7008C73704a550aA2bF20951dbb",
  },
  Deployer: {
    [ChainId.Ethereum]: "0xEc6fD701743cEdf504873F5E5E807586f437A500",
    [ChainId.Sepolia]: "0x64bc665056DC8bE4092e569ED13a7F273Be28cD2",
    [ChainId.Polygon]: "0xddDabC072c7Ea9c40e3751ff834519be15BCFA54",
    [ChainId.StabilityTestnet]: "0x9AA24846D19098b6abE79C488DD783B2FbAF3eEE",
    [ChainId.Stability]: "0xCa70F36aEEDA435c1048FD372Bf286a41ac538Be",
    [ChainId.XDC]: "0x9EFE3127e4F3f4e4CF83132F05BE11a097e0f9Ca",
    [ChainId.XDCApothem]: "0x20284AFe0B36545611dCF90Bb8128FC52e24247F",
    [ChainId.PolygonAmoy]: "0xfcafea839e576967b96ad1FBFB52b5CA26cd1D25",
  },
  TokenImplementation: {
    [ChainId.Ethereum]: "0x1583A4Eb50Bdde67F44A506a16c6d90C1E0A46d3",
    [ChainId.Sepolia]: "0x45c382574bb1B9C432a2e100Ab2086A4EAcB73Fd",
    [ChainId.Polygon]: "0x315d005Ea83E2B296CeD559F8228266dDa885091",
    [ChainId.PolygonAmoy]: "0x45c382574bb1B9C432a2e100Ab2086A4EAcB73Fd",
    [ChainId.StabilityTestnet]: "0x6c22FD7C07b0cdcaEA0FfB43B3Aa955D1Ee83491",
    [ChainId.Stability]: "0x9093AD686C92572750d7399484131F0b3E02b62A",
    [ChainId.XDC]: "0xCdF35cA8e01f5693B23135C7a92B8FefeFd0bDd0",
    [ChainId.XDCApothem]: "0xcc72c1b3f7875fda22bcdb147d462d7da64efc55",
  },
};
