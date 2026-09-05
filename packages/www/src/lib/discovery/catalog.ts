// Versioned authored-location groups. See docs/implementation/morpheus-discovery.md.
export const DISCOVERY_CATALOG_VERSION = 1;
export const DISCOVERY_MAP_DIGEST =
  '8504cc0dc7f18afe3f77c1b13c553a3bd040993158aef92fe4f848dfb54cc094';

export const DISCOVERY_SECTION_IDS = [
  'ship',
  'voodoo',
  'harem',
  'waterfront',
  'carnival',
  'ending',
] as const;

export type DiscoverySectionId = (typeof DISCOVERY_SECTION_IDS)[number];

export const DISCOVERY_SECTION_LABELS: Readonly<
  Record<DiscoverySectionId, string>
> = {
  ship: 'Ship',
  voodoo: 'Island dream',
  harem: 'Palace dream',
  waterfront: 'Waterfront dream',
  carnival: 'Carnival dream',
  ending: 'Ending',
};

// Arrays group the same place across authored state, lighting, and elevator variants.
export const DISCOVERY_LOCATION_SCENES: Readonly<
  Record<DiscoverySectionId, readonly (readonly number[])[]>
> = {
  ship: [
    [1010], // GameDB/Deck1/balcNWPAN
    [1020], // GameDB/Deck1/balcSWPAN
    [1030], // GameDB/Deck1/balcNEPAN
    [1040], // GameDB/Deck1/balcSEPAN
    [1050], // GameDB/Deck1/flybrdgPAN
    [1110], // GameDB/Deck1/uprEmidkPAN
    [1120], // GameDB/Deck1/lngelevPAN
    [1130], // GameDB/Deck1/lngmontyPAN
    [1150], // GameDB/Deck1/uprWmidkPAN
    [1210], // GameDB/Deck1/NEfordckPAN
    [1230], // GameDB/Deck1/dinermSPAN
    [1235], // GameDB/Deck1/dinermNEPAN
    [1236], // GameDB/Deck1/dinermNWPAN
    [1250], // GameDB/Deck1/corridorPAN
    [1320], // GameDB/Deck1/cmdPAN
    [1340], // GameDB/Deck1/brgEstrPAN
    [1350], // GameDB/Deck1/brgWstrPAN
    [1370], // GameDB/Deck1/bridgeEPAN
    [1380], // GameDB/Deck1/bridgeWPAN
    [2000], // GameDB/Deck2Bth/dckairPAN
    [2010], // GameDB/CargoH/holdIPAN
    [2011], // GameDB/CargoH/holdISPAN
    [2012], // GameDB/CargoH/holdIWPAN
    [2014], // GameDB/CargoH/holdIEPAN
    [2020], // GameDB/CargoH/holdIIPAN
    [2021], // GameDB/CargoH/holdIISPAN
    [2022], // GameDB/CargoH/holdIIWPAN
    [2023], // GameDB/CargoH/holdIINPAN
    [2024], // GameDB/CargoH/holdIIEPAN
    [2030], // GameDB/CargoH/holdIIIPAN
    [2032], // GameDB/CargoH/holdIIIWPAN
    [2033], // GameDB/CargoH/holdIIINPAN
    [2034], // GameDB/CargoH/holdIIIEPAN
    [2040], // GameDB/Deck2Bth/dckEfbPAN
    [2050], // GameDB/Deck2Bth/dckWfbPAN
    [2053], // GameDB/CargoH/holdIINbPAN
    [2054], // GameDB/CargoH/holdIINcPAN
    [2084], // GameDB/Deck2Bth/holdPAN
    [2085], // GameDB/Deck2Bth/gangwayPAN
    [2090], // GameDB/Deck2Bth/cargoEPAN
    [2091], // GameDB/Deck2Bth/ohcargEPAN
    [2095], // GameDB/Deck2Bth/cargoWPAN
    [2096], // GameDB/Deck2Bth/ohcargWPAN
    [2110], // GameDB/Deck2/ghSPAN
    [2115], // GameDB/Deck2/ghfrogPAN
    [2120], // GameDB/Deck2/ghWPAN
    [2125], // GameDB/Deck2/gh1stbsePAN
    [2130], // GameDB/Deck2/ghEPAN
    [2135], // GameDB/Deck2/gh3rdbsePAN
    [2140], // GameDB/Deck2/ghWdoorPAN
    [2150], // GameDB/Deck2/ghmidPAN
    [2160], // GameDB/Deck2/ghEdoorPAN
    [2170], // GameDB/Deck2Bth/dckWdorPAN
    [2180], // GameDB/Deck2Bth/dckEdorPAN
    [2210], // GameDB/Deck2/ednWghPAN
    [2220], // GameDB/Deck2/ednEghPAN
    [2230, 2231], // GameDB/Deck2/ednWctrPAN
    [2240, 2241], // GameDB/Deck2/ednMSCbxPAN
    [2250, 2251], // GameDB/Deck2/ednSEdorPAN
    [2260, 2261], // GameDB/Deck2/ednNEdorPAN
    [2270], // GameDB/Deck2/ednNdecoPAN
    [2280, 2281], // GameDB/Deck2/ednSWdorPAN
    [2290, 2291], // GameDB/Deck2/ednNWdorPAN
    [2300], // GameDB/Deck2Bth/middkEdrPAN
    [2310], // GameDB/Deck2Bth/middkEPAN
    [2320, 2321], // GameDB/Deck2/lanEPAN
    [2330, 2331], // GameDB/Deck2/landgPAN
    [2350], // GameDB/Deck2/decoSdorPAN
    [2370, 2371], // GameDB/Deck2/lanWPAN
    [2380], // GameDB/Deck2Bth/middkWPAN
    [2390], // GameDB/Deck2Bth/middkWdrPAN
    [2410], // GameDB/Deck2/hallPAN
    [2420], // GameDB/Deck2/hallNPAN
    [2510], // GameDB/Deck2/GymDoorPAN
    [2520], // GameDB/Deck2/GymEPAN
    [2530], // GameDB/Deck2/GymWPAN
    [2570], // GameDB/Deck2/poolPAN
    [2610], // GameDB/Deck2Bth/fordckEPAN
    [2620], // GameDB/Deck2Bth/fordckNPAN
    [2630], // GameDB/Deck2Bth/fordckWPAN
    [3010], // GameDB/Deck3Aft/vapordorPAN
    [3015], // GameDB/Deck3Aft/vapsteamPAN
    [3016], // GameDB/Deck3Aft/vapstm2PAN
    [3020], // GameDB/Deck3Aft/ariumdrsPAN
    [3030], // GameDB/Deck3Aft/tepidSPAN
    [3035], // GameDB/Deck3Aft/tepidNPAN
    [3040], // GameDB/Deck3Aft/frigidSPAN
    [3045], // GameDB/Deck3Aft/frigidNPAN
    [3050], // GameDB/Deck3Aft/labchairPAN
    [3060], // GameDB/Deck3Aft/labdoorPAN
    [3070], // GameDB/Deck3Aft/turkdoorPAN
    [3080], // GameDB/Deck3Aft/shpmodSPAN
    [3081], // GameDB/Deck3Aft/shpmodWPAN
    [3082], // GameDB/Deck3Aft/shpmodEPAN
    [3083], // GameDB/Deck3Aft/shpmodNPAN
    [3090], // GameDB/Deck3Aft/muddoorPAN
    [3095], // GameDB/Deck3Aft/mudbathPAN
    [3110], // GameDB/Deck3Aft/maldoorPAN
    [3120], // GameDB/Deck3Aft/malbedPAN
    [3210], // GameDB/Deck3Aft/gracdoorPAN
    [3220], // GameDB/Deck3Aft/gracebedPAN
    [3310], // GameDB/Deck3Aft/swanbedPAN
    [3320], // GameDB/Deck3Aft/swandoorPAN
    [3410], // GameDB/Deck3Aft/mexdoorPAN
    [3420], // GameDB/Deck3Aft/mexbedPAN
    [3510], // GameDB/Deck3Aft/leodoorPAN
    [3520], // GameDB/Deck3Aft/leobedPAN
    [3610], // GameDB/Deck3Aft/moondoorPAN
    [3620], // GameDB/Deck3Aft/moonbedPAN
    [3710, 3711], // GameDB/Deck3For/newelPAN
    [3730], // GameDB/Deck3For/stairNEPAN
    [3750], // GameDB/Deck3For/stairNWPAN
    [3760], // GameDB/Deck3For/srvIIIEPAN
    [3770], // GameDB/Deck3For/srvIIIWPAN
    [3810, 3811], // GameDB/Deck3For/lobelevPAN
    [3820], // GameDB/Deck3For/lobbyNPAN
    [3830], // GameDB/Deck3For/janbedPAN
    [3840], // GameDB/Deck3For/JandoorPAN
    [3850], // GameDB/Deck3For/JCbedPAN
    [3860], // GameDB/Deck3For/JCdoorPAN
    [3910], // GameDB/Deck3For/theatrePAN
    [4000], // GameDB/Deck4/cargctrlPAN
    [4010], // GameDB/Deck4/cargct2PAN
    [4210, 4215], // GameDB/Deck4/cntrlPAN
    [4212, 4216], // GameDB/Deck4/cntrlbPAN
    [4220], // GameDB/Deck4/stageNPAN
    [4230], // GameDB/Deck4/stageWPAN
    [4240], // GameDB/Deck4/stageEPAN
    [4250], // GameDB/Deck4/srvIVWPAN
    [4260], // GameDB/Deck4/srvIVEPAN
    [4310, 4311], // GameDB/sanitory/saniSPAN
    [4320, 4321], // GameDB/sanitory/sanictrPAN
    [4330], // GameDB/sanitory/saniNPAN
    [4340, 4341, 4345], // GameDB/sanitory/saniElPAN
    [5110], // GameDB/Deck5/alcoveSPAN
    [5120], // GameDB/Deck5/UraniumEPAN
    [5130], // GameDB/Deck5/UraniumWPAN
    [5140], // GameDB/Deck5/ladderNPAN
    [5210], // GameDB/neuro/clairePAN
    [5320], // GameDB/neuro/neuroSPAN
    [5325], // GameDB/neuro/neuroSbPAN
    [5330], // GameDB/neuro/neuroctrPAN
    [5340], // GameDB/neuro/neuroNPAN
    [6001, 6002, 6003, 6004, 6013, 6014], // GameDB/Elevator/elevPAN
  ],
  voodoo: [
    [7000], // GameDB/Voodoo/oboliskPAN
    [7010], // GameDB/Voodoo/grottoPAN
    [7015], // GameDB/Voodoo/crosroadPAN
    [7030, 7031, 7032, 7033, 7034, 7035, 7036, 7037, 7038, 7039], // GameDB/Voodoo/C2MoLoAPAN
    [7040, 7041, 7042, 7043, 7044, 7045, 7046, 7047, 7048, 7049], // GameDB/Voodoo/AMoLoAPAN
    [7050, 7051, 7052, 7053, 7054, 7055, 7056, 7057, 7058, 7059], // GameDB/Voodoo/BMoLoAPAN
    [7060, 7061, 7062, 7063, 7064, 7065, 7066, 7067, 7068, 7069, 7169, 7269], // GameDB/Voodoo/CMoLoAPAN
    [7080], // GameDB/Voodoo/beachPAN
    [7085], // GameDB/Voodoo/bridgePAN
    [7100], // GameDB/Voodoo/ceremonyPAN
    [7130, 7131, 7132, 7133, 7134, 7135, 7136, 7137, 7138, 7139], // GameDB/Voodoo/C1MoLoAPan
    [7237], // GameDB/Voodoo/DUpPAN
    [7238], // GameDB/Voodoo/EUpPAN
  ],
  harem: [
    [7600], // GameDB/Harem/taproomPAN
    [7610], // GameDB/Harem/tapdoorPAN
    [7710], // GameDB/Harem/lionLPAN
    [7720], // GameDB/Harem/poolLPAN
    [7725], // GameDB/Harem/lionRPAN
    [7730], // GameDB/Harem/poolRPAN
    [7740], // GameDB/Harem/colBPAN
    [7745], // GameDB/Harem/banqBPAN
    [7746], // GameDB/Harem/hookaBPAN
    [7750], // GameDB/Harem/colTPAN
    [7755], // GameDB/Harem/banqTPAN
    [7756], // GameDB/Harem/hookaTPAN
    [7760], // GameDB/Harem/crtyrdPAN
    [7800], // GameDB/Harem/bazaardrPAN
    [7810], // GameDB/Harem/bazinstPAN
    [7820], // GameDB/Harem/bazsnakePAN
    [7880], // GameDB/Harem/topstrLPAN
    [7885], // GameDB/Harem/uppassLPAN
    [7886], // GameDB/Harem/upcrtLPAN
    [7890], // GameDB/Harem/topstrRPAN
    [7895], // GameDB/Harem/uppassRPAN
    [7896], // GameDB/Harem/upcrtRPAN
    [7900], // GameDB/Harem/birdPAN
  ],
  waterfront: [
    [8500], // GameDB/h2oFront/policePAN
    [8505], // GameDB/h2oFront/frntdeskPAN
    [8510], // GameDB/h2oFront/PSfrontPAN
    [8515], // GameDB/h2oFront/cell1PAN
    [8516], // GameDB/h2oFront/cell2PAN
    [8517], // GameDB/h2oFront/cell3PAN
    [8520], // GameDB/h2oFront/PSdeskPAN
    [8525], // GameDB/h2oFront/flatfilePAN
    [8530], // GameDB/h2oFront/PSdoorPAN
    [8535], // GameDB/h2oFront/outmorgPAN
    [8537], // GameDB/h2oFront/morguePAN
    [8538], // GameDB/h2oFront/morgue2PAN
    [8550], // GameDB/h2oFront/cartPAN
    [8600], // GameDB/h2oFront/vicPAN
    [8610], // GameDB/h2oFront/PBentryPAN
    [8615], // GameDB/h2oFront/PBlrPAN
    [8620], // GameDB/h2oFront/PBstudyPAN
    [8630], // GameDB/h2oFront/PBupstarPAN
    [8631], // GameDB/h2oFront/PB1PAN
    [8632], // GameDB/h2oFront/PB2PAN
    [8633], // GameDB/h2oFront/PB3PAN
    [8634], // GameDB/h2oFront/PB4PAN
    [8635], // GameDB/h2oFront/PB5PAN
    [8636], // GameDB/h2oFront/PB6PAN
    [8700], // GameDB/h2oFront/pubPAN
    [8710], // GameDB/h2oFront/pubdoorPAN
    [8720], // GameDB/h2oFront/fireplPAN
    [8730], // GameDB/h2oFront/dartsPAN
    [8750], // GameDB/h2oFront/warehsePAN
    [8760], // GameDB/h2oFront/alleyPAN
    [8770], // GameDB/h2oFront/warehs1PAN
    [8780], // GameDB/h2oFront/warehs2PAN
    [8800], // GameDB/h2oFront/sweeneyPAN
  ],
  carnival: [
    [8000], // GameDB/carnival/8000PAN
    [8010], // GameDB/carnival/8010PAN
    [8020], // GameDB/carnival/8020PAN
    [8030], // GameDB/carnival/8030PAN
    [8040], // GameDB/carnival/8040PAN
    [8050], // GameDB/carnival/8050PAN
    [8060], // GameDB/carnival/8060PAN
    [8070], // GameDB/carnival/8070PAN
    [8080], // GameDB/carnival/8080PAN
    [8085], // GameDB/carnival/8085PAN
  ],
  ending: [
    [8900], // GameDB/iceNchat/icecaveAPAN
    [8910], // GameDB/iceNchat/icecaveBPAN
    [8950], // GameDB/iceNchat/wchateauPAN
    [
      895051, 895052, 895053, 895054, 895055, 895056, 895057, 895058, 895065,
      895066,
    ], // End sequence finished; narrative credits only
  ],
};
