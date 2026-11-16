import { Bus, BusRoute, BusStop, RouteStopItem } from '../types';
import { INITIAL_ROUTES } from '../data/mockData';
import { scoreStopMatch } from '../utils/fuzzySearch';

export interface RawRouteRecord {
  route: string;
  origin: string;
  destination: string;
  via: string;
  notes?: string;
  category?: string;
}

export interface MatchedJourney {
  id: string;
  routeNumber: string;
  origin: string;
  destination: string;
  passengerOrigin: string;
  passengerDestination: string;
  allStops: string[];
  viaStops: string[];
  journeyStops: string[]; // only stops from passenger origin to passenger destination
  intermediateStopsCount: number;
  estimatedDurationMin: number;
  distanceKm: number;
  notes?: string;
  category: string;
  color: string;
  crowdLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  crowdPercentage?: number;
  currentPassengers?: number;
  capacity?: number;
  hasLiveGps: boolean;
  busNumber?: string;
  speedKmh?: number;
  locationSource?: 'SIMULATED' | 'MANUAL' | 'REAL-TIME GPS' | 'NONE';
  nextStopName?: string;
  etaNextStopMin?: number;
  waypoints: [number, number][]; // [lat, lng]
  unresolvedStops: string[];
  eligibleBuses?: any[];
  searchId?: string;
}

export interface TransferJourney {
  id: string;
  origin: string;
  destination: string;
  transferStop: string;
  leg1: MatchedJourney;
  leg2: MatchedJourney;
  totalDurationMin: number;
  totalDistanceKm: number;
}

// Normalized dictionary of major Chennai transit locations & GPS Coordinates
export const CHENNAI_STOP_COORDINATES: Record<string, [number, number]> = {
  thiruvottriyur: [13.1601, 80.3015],
  theradi: [13.1492, 80.2985],
  tollgate: [13.1315, 80.293],
  tondiarpet: [13.125, 80.288],
  kasimedu: [13.118, 80.295],
  royapuram: [13.109, 80.296],
  beachstation: [13.0945, 80.2925],
  broadway: [13.088, 80.287],
  mgrcentral: [13.0827, 80.2707],
  central: [13.0827, 80.2707],
  porrsons: [13.075, 80.272],
  lic: [13.0645, 80.264],
  royapettah: [13.053, 80.262],
  mylapore: [13.0368, 80.2676],
  mandaveli: [13.028, 80.261],
  adyar: [13.0012, 80.2565],
  thiruvanmiyur: [12.983, 80.2594],
  ennore: [13.203, 80.324],
  ernavoor: [13.185, 80.312],
  wimconagar: [13.17, 80.306],
  vocnagar: [13.188, 80.318],
  thalankuppam: [13.208, 80.326],
  ernavoorkuppam: [13.195, 80.319],
  ondikuppam: [13.165, 80.308],
  highcourt: [13.087, 80.288],
  annasquare: [13.064, 80.283],
  triplicane: [13.058, 80.274],
  thirupalli: [13.092, 80.275],
  basinbridge: [13.098, 80.269],
  mkbnagar: [13.115, 80.258],
  sidco: [13.118, 80.252],
  kaviarasukannadasannagar: [13.125, 80.25],
  parktown: [13.082, 80.278],
  thiyagarayanagar: [13.0418, 80.2341],
  tnagar: [13.0418, 80.2341],
  saidapet: [13.021, 80.223],
  littlemount: [13.0135, 80.222],
  guindyracecourse: [13.007, 80.215],
  velachery: [12.975, 80.221],
  tharamani: [12.986, 80.243],
  srptools: [12.9825, 80.248],
  tidelpark: [12.9892, 80.2483],
  minjur: [13.279, 80.262],
  nandiambakkam: [13.255, 80.272],
  athipattupudhunagar: [13.242, 80.289],
  annauniversity: [13.0125, 80.236],
  madhyakailash: [13.0065, 80.247],
  musicacademy: [13.045, 80.255],
  alwarpet: [13.037, 80.251],
  adyargate: [13.027, 80.248],
  kotturpuram: [13.022, 80.242],
  besantnagar: [12.999, 80.267],
  vadapalani: [13.05, 80.212],
  mettupalayam: [13.035, 80.218],
  westsaidapet: [13.028, 80.217],
  ashokpillar: [13.035, 80.212],
  kalaignarnagar: [13.036, 80.198],
  nesappakam: [13.033, 80.195],
  nesapakkam: [13.033, 80.195],
  kannaginagarscb: [12.937, 80.236],
  kandanchavadi: [12.968, 80.246],
  perungudi: [12.965, 80.245],
  islandgrounds: [13.076, 80.283],
  parryscorner: [13.088, 80.289],
  secretariat: [13.079, 80.286],
  marinabeach: [13.05, 80.2824],
  qmc: [13.045, 80.28],
  santhome: [13.033, 80.278],
  foreshoreestate: [13.022, 80.277],
  indiranagar: [12.995, 80.256],
  ambathurie: [13.098, 80.162],
  annanagarwest: [13.092, 80.198],
  periyamedu: [13.083, 80.266],
  vepery: [13.085, 80.261],
  purasaivakkam: [13.09, 80.256],
  kellys: [13.088, 80.247],
  chinthamani: [13.086, 80.222],
  roundana: [13.085, 80.215],
  thirumangalam: [13.084, 80.199],
  collectornagar: [13.083, 80.187],
  vaavin: [13.088, 80.177],
  jjnagareast: [13.084, 80.185],
  jjnagarwest: [13.087, 80.174],
  padikuppam: [13.086, 80.193],
  thiruvikanagar: [13.118, 80.233],
  thambuchetty: [13.092, 80.291],
  vallalarnagar: [13.104, 80.279],
  pulianthope: [13.097, 80.265],
  otteri: [13.092, 80.252],
  jamaliya: [13.101, 80.246],
  perambur: [13.109, 80.237],
  venus: [13.115, 80.232],
  agscolony: [12.981, 80.203],
  citnagar: [13.033, 80.229],
  valluvarkottam: [13.056, 80.241],
  sterlingroad: [13.064, 80.24],
  dpi: [13.065, 80.249],
  egmore: [13.078, 80.261],
  ekkattuthangal: [13.023, 80.206],
  pondybazaar: [13.042, 80.24],
  dms: [13.048, 80.249],
  mambalam: [13.038, 80.226],
  chepauk: [13.065, 80.279],
  iyyappanthangal: [13.041, 80.134],
  porur: [13.038, 80.156],
  valasaravakkam: [13.044, 80.176],
  saligramam: [13.053, 80.194],
  bharathinagar: [13.045, 80.228],
  liberty: [13.048, 80.222],
  luz: [13.038, 80.265],
  vivekanandahouse: [13.052, 80.28],
  mgrkoyambedu: [13.07, 80.194],
  koyambedu: [13.07, 80.194],
  arumbakkam: [13.067, 80.208],
  arumbakkammetro: [13.065, 80.208],
  vanimahal: [13.047, 80.243],
  thousandlights: [13.058, 80.253],
  gopalapuram: [13.052, 80.256],
  pycroftroad: [13.057, 80.272],
  choolai: [13.09, 80.267],
  ayanavaram: [13.098, 80.237],
  icf: [13.101, 80.221],
  kilpaukgarden: [13.082, 80.238],
  nsknagar: [13.068, 80.213],
  ngocolony: [12.991, 80.201],
  medavakkamkootroad: [12.92, 80.188],
  medavakkam: [12.92, 80.188],
  stthomasmount: [12.998, 80.198],
  vanuvampet: [12.984, 80.196],
  kilkattalai: [12.962, 80.189],
  kovilambakkam: [12.946, 80.189],
  vellaikal: [12.934, 80.187],
  aminjikarai: [13.073, 80.226],
  kmc: [13.078, 80.241],
  dasaprakash: [13.08, 80.253],
  egmorenorth: [13.081, 80.261],
  virugambakkam: [13.051, 80.191],
  chinmayanagar: [13.059, 80.197],
  koyambedumarket: [13.066, 80.195],
  mmdacolony: [13.07, 80.215],
  poonamallee: [13.048, 80.095],
  kumananchavadi: [13.049, 80.119],
  kundrathur: [12.998, 80.098],
  periyapanicherry: [13.018, 80.128],
  kolachery: [13.008, 80.116],
  chintadripet: [13.076, 80.272],
  dasarathapuram: [13.051, 80.205],
  kilambakkam: [12.871, 80.082],
  kilambakkamkcbt: [12.871, 80.082],
  kcbt: [12.871, 80.082],
  sembakkam: [12.926, 80.162],
  selaiyur: [12.923, 80.155],
  tambarameast: [12.9249, 80.1498],
  tambaramwest: [12.925, 80.144],
  pudupakkam: [12.805, 80.201],
  mambakkam: [12.836, 80.161],
  killakottaiyur: [12.845, 80.147],
  kandigai: [12.852, 80.134],
  rathinamangalam: [12.858, 80.125],
  vandalur: [12.891, 80.082],
  vandalurzoo: [12.887, 80.081],
  eachangadu: [12.943, 80.202],
  kamatchihospital: [12.946, 80.208],
  seevaram: [12.962, 80.246],
  okkiyampet: [12.944, 80.239],
  velsuniversity: [12.957, 80.174],
  pallikaranai: [12.937, 80.206],
  santhoshapuram: [12.921, 80.175],
  gowsivaramapuram: [12.922, 80.168],
  irumbuliyur: [12.915, 80.128],
  mambakkamroad: [12.836, 80.161],
  teynampet: [13.042, 80.25],
  nandanam: [13.032, 80.241],
  guindy: [13.0067, 80.2024],
  alandurmetro: [13.004, 80.201],
  airport: [12.9815, 80.1636],
  pallavaram: [12.968, 80.15],
  chromepet: [12.9516, 80.1462],
  tambaram: [12.9249, 80.1478],
  perungalathur: [12.906, 80.098],
  vandaloorzoo: [12.887, 80.081],
  ramapuram: [13.031, 80.181],
  kathipara: [13.006, 80.204],
  nandambakkam: [13.016, 80.187],
  naduveerapattu: [12.952, 80.082],
  pazhanthandalam: [12.961, 80.098],
  poonthandalam: [12.958, 80.085],
  nallur: [12.964, 80.076],
  somangalam: [12.973, 80.065],
  guduvanchery: [12.844, 80.062],
  madambakkam: [12.858, 80.075],
  kuthanur: [12.862, 80.083],
  pazhavanthangal: [12.993, 80.188],
  nanganallur: [12.987, 80.19],
  adambakkam: [12.989, 80.205],
  puzhuthivakkam: [12.979, 80.202],
  oonamancherry: [12.872, 80.062],
  nedungundram: [12.894, 80.075],
  kolapakkam: [12.886, 80.068],
  thiruporur: [12.725, 80.189],
  sholinganallur: [12.901, 80.2279],
  chemmanchery: [12.873, 80.226],
  navalur: [12.85, 80.228],
  siruchery: [12.83, 80.222],
  padur: [12.81, 80.223],
  kelambakkam: [12.787, 80.218],
  palavakkam: [12.961, 80.258],
  neelankarai: [12.949, 80.256],
  injambakkam: [12.923, 80.251],
  akkarai: [12.905, 80.249],
  kanathur: [12.882, 80.245],
  muttukadu: [12.825, 80.241],
  kovalam: [12.793, 80.251],
  avadi: [13.1147, 80.1009],
  pattabiram: [13.123, 80.062],
  thiruninravur: [13.118, 80.027],
  thiruvallur: [13.143, 79.907],
  redhills: [13.199, 80.196],
  madhavaram: [13.148, 80.231],
  moolakadai: [13.129, 80.244],
  korattur: [13.111, 80.183],
  lucas: [13.108, 80.187],
  padi: [13.102, 80.192],
  thiruverkadu: [13.072, 80.124],
  retteri: [13.128, 80.214],
  puzhal: [13.158, 80.205],
  ambathurot: [13.114, 80.159],
  maduravoyal: [13.066, 80.165],
  thirumullaivoyal: [13.131, 80.131],
  thirumazhisai: [13.054, 80.062],
  doveton: [13.091, 80.259],
  gemini: [13.053, 80.252],
  checkpost: [13.008, 80.221],
  pudupet: [13.071, 80.264],
  chetpet: [13.071, 80.242],
  loyolacollege: [13.062, 80.233],
  kolathur: [13.124, 80.204],
  pammal: [12.975, 80.138],
  manali: [13.166, 80.262],
  shastrinagar: [12.996, 80.261],
  palmgrove: [13.055, 80.244],
  sriperumbudur: [12.967, 79.941],
  mangadu: [13.038, 80.115],
  anakaputhur: [12.982, 80.125],
  arignarannainternationalairport: [12.9815, 80.1636],
  kelambakkamchettinadhospital: [12.791, 80.215],
  okkiyamthoraipakkamseccolony: [12.944, 80.239],
  guindyie: [13.0067, 80.2024],
  vandaloor: [12.887, 80.081],
  kottivakkam: [12.971, 80.258],
  karapakkam: [12.918, 80.229],
  thoraipakkam: [12.936, 80.235],
  sholinganalur: [12.901, 80.2279],
};

const normStopCache = new Map<string, string>();

// Common string normalization (handles dots, spaces, case, suffixes)
export function normalizeStopName(name: string): string {
  if (!name) return '';
  const cached = normStopCache.get(name);
  if (cached !== undefined) return cached;

  let cleaned = name.trim().toLowerCase();

  // Strip trailing punctuation
  cleaned = cleaned.replace(/[,;]+$/, '').trim();

  let result = '';
  // Common transit aliases
  if (/^t[\.\s]*nagar$/i.test(cleaned) || cleaned === 'thiyagaraya nagar' || cleaned === 't nagar') {
    result = 'thiyagarayanagar';
  } else if (/^(mgr\s*central|m\.g\.r\s*central|central\s*railway|chennai\s*central|central)$/i.test(cleaned)) {
    result = 'mgrcentral';
  } else if (/^thiruvottiyur$/i.test(cleaned) || /^thiruvottriyur$/i.test(cleaned)) {
    result = 'thiruvottriyur';
  } else if (/^thiruvanmiyur$/i.test(cleaned)) {
    result = 'thiruvanmiyur';
  } else if (/^ennore$/i.test(cleaned)) {
    result = 'ennore';
  } else if (/^broadway$/i.test(cleaned) || /^parrys/i.test(cleaned)) {
    result = 'broadway';
  } else if (/^koyambedu/i.test(cleaned) || /^cmbt/i.test(cleaned) || /^m\.g\.r\s*koyambedu/i.test(cleaned)) {
    result = 'mgrkoyambedu';
  } else if (/^kilambakkam/i.test(cleaned) || /^kcbt/i.test(cleaned)) {
    result = 'kilambakkam';
  } else if (/^guindy(\s*i\.?e\.?|\s*industrial)?$/i.test(cleaned)) {
    result = 'guindy';
  } else if (/^(arignar\s*anna\s*international\s*)?airport$/i.test(cleaned)) {
    result = 'airport';
  } else if (/^vandal(oor|ur)(\s*zoo)?$/i.test(cleaned)) {
    result = 'vandaloorzoo';
  } else {
    // Remove punctuation & extra whitespace
    result = cleaned.replace(/[\.\(\)\-\_\/]/g, '').replace(/\s+/g, '');
  }

  if (normStopCache.size > 4000) normStopCache.clear();
  normStopCache.set(name, result);
  return result;
}

export function getCoordinatesForStop(stopName: string): [number, number] | null {
  const norm = normalizeStopName(stopName);
  if (CHENNAI_STOP_COORDINATES[norm]) {
    return CHENNAI_STOP_COORDINATES[norm];
  }

  // Try exact substring match only for sufficiently specific keys (>= 6 chars)
  for (const [key, coords] of Object.entries(CHENNAI_STOP_COORDINATES)) {
    if (key.length >= 6 && norm.length >= 6 && (norm.includes(key) || key.includes(norm))) {
      return coords;
    }
  }

  return null;
}

// Clean and parse the via column into ordered stops
export function parseViaStops(viaString: string): string[] {
  if (!viaString) return [];
  return viaString
    .split(',')
    .map((s) => s.trim().replace(/^"/, '').replace(/"$/, '').replace(/[,;]+$/, '').trim())
    .filter((s) => s.length > 0 && s !== ',');
}

const GENERIC_STOP_WORDS = new Set([
  'nagar',
  'road',
  'rd',
  'station',
  'bus',
  'stop',
  'park',
  'colony',
  'metro',
  'gate',
  'hospital',
  'university',
  'east',
  'west',
  'north',
  'south',
  'new',
  'old',
  'bridge',
  'corner',
  'zoo',
  'market',
  'garden',
  'college',
  'terminus',
  'stand',
  'depot',
  'scb',
  'ie',
]);

const stopMatchCache = new Map<string, boolean>();

// Check if a stop matches target query (fuzzy & normalized, avoiding generic suffix false positives)
export function isStopMatch(stopName: string, query: string): boolean {
  if (!stopName || !query) return false;
  const nStop = normalizeStopName(stopName);
  const nQuery = normalizeStopName(query);

  if (!nStop || !nQuery) return false;
  if (nStop === nQuery) return true;

  const cacheKey = `${nStop}|${nQuery}`;
  const cached = stopMatchCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let matched = false;
  if (nQuery.length >= 5 && nStop.length >= 5 && (nStop.includes(nQuery) || nQuery.includes(nStop))) {
    const shortIsGeneric = GENERIC_STOP_WORDS.has(nQuery) || GENERIC_STOP_WORDS.has(nStop);
    if (!shortIsGeneric) matched = true;
  }

  // Smart fuzzy scoring for spelling variations (guard against wildly different string lengths)
  if (!matched && Math.abs(nStop.length - nQuery.length) <= 4) {
    const fuzzy = scoreStopMatch(query, stopName);
    if (fuzzy.score >= 76) matched = true;
  }

  // Word token match: require at least one non-generic token to match cleanly
  if (!matched) {
    const stopWords = stopName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3);
    const queryWords = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3);
    const specificQueryWords = queryWords.filter((w) => !GENERIC_STOP_WORDS.has(w));
    const requiredWords = specificQueryWords.length > 0 ? specificQueryWords : queryWords;

    matched =
      requiredWords.length > 0 &&
      requiredWords.every((qw) => stopWords.some((sw) => sw === qw || (qw.length >= 5 && sw.startsWith(qw))));
  }

  if (stopMatchCache.size > 15000) stopMatchCache.clear();
  stopMatchCache.set(cacheKey, matched);
  return matched;
}

// Route color palette generator
const ROUTE_COLORS = [
  '#2563eb', // blue
  '#7c3aed', // purple
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // red
  '#0891b2', // cyan
  '#db2777', // pink
];

/**
 * Evaluates directional & stop-sequence alignment between a candidate route's ordered stops
 * and the passenger's planned journey stops.
 * Returns whether the candidate travels in the SAME forward direction as the passenger.
 */
export function analyzeCorridorAlignment(
  candidateStopNames: string[],
  plannedJourney: MatchedJourney
): {
  isSameDirection: boolean;
  sharesOriginAndDestInOrder: boolean;
  sharedStopsCount: number;
  matchedIndices: { jIdx: number; cIdx: number }[];
} {
  const jStops =
    plannedJourney.journeyStops && plannedJourney.journeyStops.length > 0
      ? plannedJourney.journeyStops
      : [plannedJourney.passengerOrigin, plannedJourney.passengerDestination].filter(Boolean);

  if (jStops.length < 2 || candidateStopNames.length < 2) {
    return {
      isSameDirection: false,
      sharesOriginAndDestInOrder: false,
      sharedStopsCount: 0,
      matchedIndices: [],
    };
  }

  // Direct origin -> destination sequence check on candidate's ordered stops
  let cOrigIdx = -1;
  let cDestIdx = -1;
  for (let i = 0; i < candidateStopNames.length; i++) {
    if (cOrigIdx === -1 && isStopMatch(candidateStopNames[i], plannedJourney.passengerOrigin)) {
      cOrigIdx = i;
    }
    if (isStopMatch(candidateStopNames[i], plannedJourney.passengerDestination)) {
      cDestIdx = i;
    }
  }
  const sharesOriginAndDestInOrder = cOrigIdx !== -1 && cDestIdx !== -1 && cOrigIdx < cDestIdx;
  const sharesOriginAndDestReversed = cOrigIdx !== -1 && cDestIdx !== -1 && cOrigIdx > cDestIdx;
  if (sharesOriginAndDestReversed) {
    return {
      isSameDirection: false,
      sharesOriginAndDestInOrder: false,
      sharedStopsCount: 0,
      matchedIndices: [],
    };
  }

  // Map each journey stop in passenger travel order to its position in candidate stops
  const matchedIndices: { jIdx: number; cIdx: number }[] = [];
  const usedCIdx = new Set<number>();

  jStops.forEach((jStop, jIdx) => {
    for (let cIdx = 0; cIdx < candidateStopNames.length; cIdx++) {
      if (!usedCIdx.has(cIdx) && isStopMatch(candidateStopNames[cIdx], jStop)) {
        matchedIndices.push({ jIdx, cIdx });
        usedCIdx.add(cIdx);
        break;
      }
    }
  });

  if (matchedIndices.length < 2) {
    return {
      isSameDirection: false,
      sharesOriginAndDestInOrder,
      sharedStopsCount: matchedIndices.length,
      matchedIndices,
    };
  }

  // Verify forward sequence direction: cIdx must progress forward (increasing) as jIdx increases
  let forwardPairs = 0;
  let reversePairs = 0;
  for (let i = 0; i < matchedIndices.length - 1; i++) {
    for (let k = i + 1; k < matchedIndices.length; k++) {
      if (matchedIndices[k].cIdx > matchedIndices[i].cIdx) forwardPairs++;
      else if (matchedIndices[k].cIdx < matchedIndices[i].cIdx) reversePairs++;
    }
  }

  const isSameDirection = forwardPairs > 0 && forwardPairs > reversePairs;

  return {
    isSameDirection,
    sharesOriginAndDestInOrder,
    sharedStopsCount: matchedIndices.length,
    matchedIndices,
  };
}

// Helper: Determines whether a candidate route shares/travels along the planned journey corridor in the SAME direction
export function isRouteOnCorridor(
  route: BusRoute,
  plannedJourney: MatchedJourney | null
): boolean {
  if (!plannedJourney) return false;

  const journeyRNum = (plannedJourney.routeNumber || '').toUpperCase().trim();
  const candidateRNum = (route.routeNumber || '').toUpperCase().trim();

  // Exclude the selected route itself (both outbound & inbound of the selected route number are not "other corridor" routes)
  if (candidateRNum === journeyRNum || route.id === plannedJourney.id) {
    return false;
  }

  const candidateStops = (route.stops || [])
    .slice()
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
    .map((s) => s.stopName);

  if (candidateStops.length < 2) return false;

  const alignment = analyzeCorridorAlignment(candidateStops, plannedJourney);
  if (!alignment.isSameDirection) {
    return false;
  }

  // Must share at least 2 stops in the same forward travel direction (or carry directly from origin to destination)
  return alignment.sharesOriginAndDestInOrder || alignment.sharedStopsCount >= 2;
}

/**
 * Checks whether an individual bus vehicle serves the selected journey or its corridor
 * in the CORRECT travel direction & stop sequence.
 */
export function evaluateBusForJourney(
  bus: Bus,
  busRoute: BusRoute | undefined,
  plannedJourney: MatchedJourney | null,
  corridorRouteIds?: Set<string>
): { eligible: boolean; role: 'direct' | 'corridor' | 'none'; label: string } {
  if (!plannedJourney) {
    return { eligible: true, role: 'direct', label: 'Active Fleet Bus' };
  }

  if (bus.status === 'out_of_service' || bus.status === 'maintenance') {
    return { eligible: false, role: 'none', label: 'Inactive' };
  }

  const orderedStopNames =
    busRoute && busRoute.stops && busRoute.stops.length >= 2
      ? busRoute.stops
          .slice()
          .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
          .map((s) => s.stopName)
      : [];

  if (orderedStopNames.length < 2) {
    return { eligible: false, role: 'none', label: 'No Route Sequence' };
  }

  const alignment = analyzeCorridorAlignment(orderedStopNames, plannedJourney);
  const busRNum = (bus.routeNumber || bus.busNumber || '').toUpperCase().trim();
  const journeyRNum = (plannedJourney.routeNumber || '').toUpperCase().trim();

  // 1. Direct / Selected Journey Bus: must travel from passengerOrigin to passengerDestination in forward order
  if (alignment.sharesOriginAndDestInOrder) {
    if (busRNum === journeyRNum || bus.routeId === plannedJourney.id) {
      return { eligible: true, role: 'direct', label: 'Selected Journey Bus' };
    }
    return { eligible: true, role: 'corridor', label: 'Direct Alternative Corridor Bus' };
  }

  // Same route number travelling in the WRONG direction -> strictly exclude!
  if (busRNum === journeyRNum) {
    return { eligible: false, role: 'none', label: 'Opposite Direction' };
  }

  // 2. Other Corridor Bus: must share >= 2 corridor stops in the SAME forward direction
  const isCorridorRoute =
    corridorRouteIds && busRoute ? corridorRouteIds.has(busRoute.id) : alignment.isSameDirection && alignment.sharedStopsCount >= 2;

  if (isCorridorRoute && alignment.isSameDirection && alignment.sharedStopsCount >= 2) {
    return { eligible: true, role: 'corridor', label: 'Other Route / Corridor Bus' };
  }

  return { eligible: false, role: 'none', label: 'Unrelated Corridor' };
}

/**
 * Hydrates full BusRoute[] and simulated Bus[] records from the Chennai Google Sheets CSV dataset
 * while preserving and enriching INITIAL_ROUTES and INITIAL_BUSES.
 */
export function buildDatasetRoutesAndBuses(
  rawRoutes: RawRouteRecord[],
  baseRoutes: BusRoute[],
  baseBuses: Bus[]
): { routes: BusRoute[]; buses: Bus[] } {
  const routesMap = new Map<string, BusRoute>();
  const enrichedBaseRoutes: BusRoute[] = baseRoutes.map((br) => ({
    ...br,
    stops: br.stops ? br.stops.map((s) => ({ ...s })) : [],
    pathWaypoints: br.pathWaypoints ? [...br.pathWaypoints] : [],
  }));

  // 1. Seed baseRoutes first, enriching stops from CSV if CSV provides full corridor (e.g. 95X from Thiruvanmiyur)
  enrichedBaseRoutes.forEach((br) => {
    const csvMatch = rawRoutes.find(
      (raw) =>
        raw.route.toUpperCase() === br.routeNumber.toUpperCase() &&
        isStopMatch(raw.destination, br.endPoint)
    );
    if (csvMatch) {
      const viaList = parseViaStops(csvMatch.via);
      const fullStopNames = [csvMatch.origin.trim(), ...viaList, csvMatch.destination.trim()];
      if (fullStopNames.length > br.stops.length) {
        const builtStops: RouteStopItem[] = [];
        const builtWaypoints: [number, number][] = [];
        let cumDist = 0;
        fullStopNames.forEach((stName) => {
          const existingStop = br.stops.find((s) => isStopMatch(s.stopName, stName));
          const coords = existingStop
            ? ([existingStop.latitude, existingStop.longitude] as [number, number])
            : getCoordinatesForStop(stName);
          if (coords) {
            const seq = builtStops.length + 1;
            cumDist = Number(((seq - 1) * 2.4).toFixed(1));
            builtStops.push({
              stopId: existingStop?.stopId || `stp_${normalizeStopName(stName).slice(0, 8)}`,
              stopName: stName,
              sequenceOrder: seq,
              distanceFromStartKm: cumDist,
              typicalTimeMinutes: Math.round((seq - 1) * 5),
              latitude: coords[0],
              longitude: coords[1],
            });
            builtWaypoints.push(coords);
          }
        });
        if (builtStops.length >= 2) {
          br.stops = builtStops;
          br.startPoint = builtStops[0].stopName;
          br.endPoint = builtStops[builtStops.length - 1].stopName;
          br.routeName = `${br.startPoint} ⇄ ${br.endPoint}`;
          br.pathWaypoints = builtWaypoints;
        }
      }
    }
    routesMap.set(br.id, br);
  });

  // Track which routeNumber + direction already has a BusRoute
  const routeDirKey = (rNum: string, start: string, end: string) =>
    `${rNum.toUpperCase()}|${normalizeStopName(start)}|${normalizeStopName(end)}`;
  const existingDirKeys = new Set<string>();
  routesMap.forEach((r) => {
    existingDirKeys.add(routeDirKey(r.routeNumber, r.startPoint, r.endPoint));
  });

  // Helper to construct a BusRoute from a stop name sequence
  const createBusRouteFromStops = (
    id: string,
    routeNumber: string,
    stopNames: string[],
    colorIdx: number,
    isReturn = false
  ): BusRoute | null => {
    const builtStops: RouteStopItem[] = [];
    const builtWaypoints: [number, number][] = [];

    stopNames.forEach((stName) => {
      const coords = getCoordinatesForStop(stName);
      if (coords) {
        const seq = builtStops.length + 1;
        builtStops.push({
          stopId: `stp_${normalizeStopName(stName).slice(0, 10)}`,
          stopName: stName,
          sequenceOrder: seq,
          distanceFromStartKm: Number(((seq - 1) * 1.9).toFixed(1)),
          typicalTimeMinutes: Math.round((seq - 1) * 4.5),
          latitude: coords[0],
          longitude: coords[1],
        });
        builtWaypoints.push(coords);
      }
    });

    if (builtStops.length < 2) return null;

    const startPoint = builtStops[0].stopName;
    const endPoint = builtStops[builtStops.length - 1].stopName;

    return {
      id,
      routeNumber,
      routeName: isReturn ? `${startPoint} ➔ ${endPoint} (Return)` : `${startPoint} ⇄ ${endPoint}`,
      startPoint,
      endPoint,
      distanceKm: Number((builtStops.length * 1.8).toFixed(1)),
      estimatedDurationMin: Math.max(15, Math.round(builtStops.length * 3.5)),
      city: 'Chennai',
      frequencyMinutes: 12,
      color: ROUTE_COLORS[colorIdx % ROUTE_COLORS.length],
      stops: builtStops,
      pathWaypoints: builtWaypoints,
    };
  };

  // Also create inbound return routes for INITIAL_ROUTES so bi-directional travel works cleanly
  enrichedBaseRoutes.forEach((br, idx) => {
    if (br.stops.length < 2) return;
    const revStops = [...br.stops].reverse().map((s, sIdx) => ({
      ...s,
      sequenceOrder: sIdx + 1,
    }));
    const revKey = routeDirKey(br.routeNumber, revStops[0].stopName, revStops[revStops.length - 1].stopName);
    if (!existingDirKeys.has(revKey)) {
      const revRoute: BusRoute = {
        ...br,
        id: `${br.id}_ret`,
        routeName: `${revStops[0].stopName} ➔ ${revStops[revStops.length - 1].stopName} (Return)`,
        startPoint: revStops[0].stopName,
        endPoint: revStops[revStops.length - 1].stopName,
        stops: revStops,
        pathWaypoints: [...br.pathWaypoints].reverse(),
        roadWaypoints: br.roadWaypoints ? [...br.roadWaypoints].reverse() : undefined,
      };
      routesMap.set(revRoute.id, revRoute);
      existingDirKeys.add(revKey);
    }
    void idx;
  });

  // 2. Hydrate ALL plottable CSV routes (both outbound and return directions unless marked single trip)
  rawRoutes.forEach((raw, idx) => {
    const viaList = parseViaStops(raw.via);
    const fullStopNames = [raw.origin.trim(), ...viaList, raw.destination.trim()];
    const outKey = routeDirKey(raw.route, raw.origin, raw.destination);

    if (!existingDirKeys.has(outKey)) {
      const outId = `rt_csv_${idx}_${raw.route.replace(/[^a-zA-Z0-9]/g, '')}`;
      const builtOut = createBusRouteFromStops(outId, raw.route, fullStopNames, idx, false);
      if (builtOut) {
        routesMap.set(builtOut.id, builtOut);
        existingDirKeys.add(outKey);
      }
    }

    const isSingleTripOnly = !!(raw.notes && /single\s*trip|one\s*way/i.test(raw.notes));
    if (!isSingleTripOnly) {
      const revStopNames = [...fullStopNames].reverse();
      const revKey = routeDirKey(raw.route, raw.destination, raw.origin);
      if (!existingDirKeys.has(revKey)) {
        const retId = `rt_csv_${idx}_${raw.route.replace(/[^a-zA-Z0-9]/g, '')}_ret`;
        const builtRet = createBusRouteFromStops(retId, raw.route, revStopNames, idx, true);
        if (builtRet) {
          routesMap.set(builtRet.id, builtRet);
          existingDirKeys.add(revKey);
        }
      }
    }
  });

  const allRoutes = Array.from(routesMap.values());

  // 3. Preserve baseBuses and ensure active simulated buses exist for hydrated dataset routes
  const busesList: Bus[] = baseBuses.map((b) => ({ ...b }));
  const coveredRouteIds = new Set(busesList.map((b) => b.routeId));

  allRoutes.forEach((r, idx) => {
    if (coveredRouteIds.has(r.id)) return;
    if (!r.stops || r.stops.length < 2 || !r.pathWaypoints || r.pathWaypoints.length < 2) return;

    // Seed deterministic position mid-corridor along its actual stops
    const startIdx = Math.min(
      r.pathWaypoints.length - 2,
      Math.max(0, Math.floor((r.pathWaypoints.length - 1) * ((idx % 5) * 0.15 + 0.15)))
    );
    const pt = r.pathWaypoints[startIdx];
    const nextStop = r.stops[Math.min(r.stops.length - 1, startIdx + 1)] || r.stops[1];
    const pct = 20 + ((idx * 17) % 62);
    const cap = 50;
    const passengers = Math.round((pct / 100) * cap);
    const crowdCat = pct <= 30 ? 'LOW' : pct <= 70 ? 'MEDIUM' : 'HIGH';

    busesList.push({
      id: `bus_ds_${r.id}`,
      busNumber: r.routeNumber,
      routeId: r.id,
      routeName: r.routeName,
      routeNumber: r.routeNumber,
      capacity: cap,
      currentPassengers: passengers,
      crowdPercentage: pct,
      crowdCategory: crowdCat,
      crowdDataSource: 'DEMO_SIMULATION',
      vehicleUnitId: `TN-01-N-${String(1000 + (idx % 8999))}`,
      latitude: pt[0],
      longitude: pt[1],
      speedKmh: 48 + (idx % 10),
      heading: 180,
      status: 'active',
      locationSource: 'SIMULATED',
      lastUpdated: new Date().toISOString(),
      nextStopId: nextStop.stopId,
      nextStopName: nextStop.stopName,
      etaNextStopMin: 2 + (idx % 5),
      acType: idx % 3 === 0 ? 'Electric EV' : idx % 3 === 1 ? 'AC' : 'Non-AC',
      licensePlate: `TN-01-MTC-${String(100 + (idx % 899))}`,
      currentWaypointIndex: startIdx,
      segmentProgress: 0.2,
    });
    coveredRouteIds.add(r.id);
  });

  return { routes: allRoutes, buses: busesList };
}

/**
 * Extracts a clean, deduplicated BusStop[] directory from hydrated routes
 * while preserving metadata (codes, addresses, shelter status) from existingStops.
 */
export function extractDatasetStops(
  routes: BusRoute[],
  existingStops: BusStop[] = []
): BusStop[] {
  const stopsMap = new Map<string, BusStop>();
  const existingByNorm = new Map<string, BusStop>();

  existingStops.forEach((es) => {
    if (!es.name) return;
    if (es.city && es.city.toLowerCase() !== 'chennai') return;
    existingByNorm.set(normalizeStopName(es.name), es);
    stopsMap.set(normalizeStopName(es.name), es);
  });

  let chnCounter = existingByNorm.size + 1;

  routes.forEach((route) => {
    if (route.city && route.city.toLowerCase() !== 'chennai') return;
    (route.stops || []).forEach((st) => {
      if (!st.stopName) return;
      const norm = normalizeStopName(st.stopName);
      if (!norm) return;
      const existing = stopsMap.get(norm);
      if (existing) {
        // Fill coordinates if missing on existing entry
        if ((!existing.latitude || !existing.longitude) && st.latitude && st.longitude) {
          existing.latitude = st.latitude;
          existing.longitude = st.longitude;
        }
        return;
      }

      const coords =
        st.latitude && st.longitude
          ? ([st.latitude, st.longitude] as [number, number])
          : getCoordinatesForStop(st.stopName);

      if (!coords) return;

      const code = `CHN-${String(chnCounter++).padStart(3, '0')}`;
      stopsMap.set(norm, {
        id: st.stopId || `stp_${norm.slice(0, 10)}`,
        code,
        name: st.stopName,
        latitude: coords[0],
        longitude: coords[1],
        city: route.city || 'Chennai',
        address: `${st.stopName} Bus Stop, Chennai`,
        shelterAvailable: true,
      });
    });
  });

  return Array.from(stopsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// Core Route Matching Engine
export function findMatchingRoutes(
  routes: RawRouteRecord[],
  passengerOrigin: string,
  passengerDestination: string,
  liveBuses: any[] = [],
  routeNumberFilter?: string,
  searchId?: string
): { direct: MatchedJourney[]; transfers: TransferJourney[] } {
  if (!passengerOrigin.trim() || !passengerDestination.trim()) {
    return { direct: [], transfers: [] };
  }

  const currentSearchId =
    searchId || `search_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const cleanFilter = routeNumberFilter?.trim().toUpperCase().replace(/\s+/g, '');
  const filterMatches = (rNum: string) => {
    if (!cleanFilter) return true;
    const cleanR = rNum.toUpperCase().replace(/\s+/g, '');
    return cleanR === cleanFilter || cleanR.startsWith(cleanFilter);
  };

  const directMatches: MatchedJourney[] = [];
  const validRoutesForLeg1: { route: RawRouteRecord; originIdx: number; allStops: string[] }[] = [];
  const validRoutesForLeg2: { route: RawRouteRecord; destIdx: number; allStops: string[] }[] = [];

  routes.forEach((r, routeIndex) => {
    if (!r.route || !r.origin || !r.destination) return;

    // If route number filter specified, only inspect matching routes for direct results
    const isTargetRoute = filterMatches(r.route);

    const viaList = parseViaStops(r.via);
    const allStops = [r.origin.trim(), ...viaList, r.destination.trim()];

    // Find origin match
    let originIndex = -1;
    for (let i = 0; i < allStops.length; i++) {
      if (isStopMatch(allStops[i], passengerOrigin)) {
        originIndex = i;
        break;
      }
    }

    // Find destination match
    let destIndex = -1;
    for (let i = 0; i < allStops.length; i++) {
      if (isStopMatch(allStops[i], passengerDestination)) {
        destIndex = i;
        break;
      }
    }

    // Direct match check: route serves both origin and destination (both forward and return directions)
    if (originIndex !== -1 && destIndex !== -1 && originIndex !== destIndex) {
      if (cleanFilter && !isTargetRoute) {
        return; // Filter out by user-specified route number
      }

      const isReverse = destIndex < originIndex;
      const journeySlice = isReverse
        ? allStops.slice(destIndex, originIndex + 1).reverse()
        : allStops.slice(originIndex, destIndex + 1);

      const intermediateCount = Math.max(0, journeySlice.length - 2);
      const estDuration = Math.max(12, Math.round(journeySlice.length * 2.8 + 6));
      const estDistance = Number((journeySlice.length * 1.6).toFixed(1));

      // Coordinate interpolation & Geocode check
      let waypoints: [number, number][] = [];
      const unresolvedStops: string[] = [];

      journeySlice.forEach((st) => {
        const coords = getCoordinatesForStop(st);
        if (coords) {
          waypoints.push(coords);
        } else {
          unresolvedStops.push(st);
        }
      });

      // Align with high-fidelity road-following polyline if corridor matches verified route
      const knownRoute = INITIAL_ROUTES.find(
        (ir) => ir.routeNumber.toLowerCase() === r.route.toLowerCase()
      );
      if (knownRoute && knownRoute.pathWaypoints && knownRoute.pathWaypoints.length >= waypoints.length) {
        if (
          isStopMatch(knownRoute.startPoint, passengerOrigin) &&
          isStopMatch(knownRoute.endPoint, passengerDestination)
        ) {
          waypoints = knownRoute.pathWaypoints;
        } else if (
          isStopMatch(knownRoute.endPoint, passengerOrigin) &&
          isStopMatch(knownRoute.startPoint, passengerDestination)
        ) {
          // Return trip along known route
          waypoints = [...knownRoute.pathWaypoints].reverse();
        }
      }

      // Find live buses on this route matching the exact routeNumber and travel direction
      const matchedBuses = liveBuses.filter((b) => {
        if ((b.routeNumber || b.busNumber || '').toLowerCase() !== r.route.toLowerCase()) {
          return false;
        }
        if (b.status === 'out_of_service' || b.status === 'maintenance') return false;
        // Respect directional bus routes (_ret vs outbound)
        const isBusReturn = typeof b.routeId === 'string' && b.routeId.endsWith('_ret');
        return isReverse ? isBusReturn : !isBusReturn || !liveBuses.some((ob) => ob.routeNumber?.toLowerCase() === r.route.toLowerCase() && !String(ob.routeId).endsWith('_ret'));
      });
      const matchedBus = matchedBuses[0];

      directMatches.push({
        id: `journey_${r.route}_${originIndex}_${destIndex}`,
        routeNumber: r.route,
        origin: r.origin,
        destination: r.destination,
        passengerOrigin: allStops[originIndex],
        passengerDestination: allStops[destIndex],
        allStops,
        viaStops: viaList,
        journeyStops: journeySlice,
        intermediateStopsCount: intermediateCount,
        estimatedDurationMin: estDuration,
        distanceKm: estDistance,
        notes: r.notes,
        category: r.category || 'Regular Route',
        color: ROUTE_COLORS[routeIndex % ROUTE_COLORS.length],
        crowdLevel: matchedBus?.crowdCategory || undefined,
        crowdPercentage: matchedBus?.crowdPercentage || undefined,
        currentPassengers: matchedBus?.currentPassengers,
        capacity: matchedBus?.capacity || 50,
        hasLiveGps: !!matchedBus,
        busNumber: matchedBus?.busNumber,
        speedKmh: matchedBus?.speedKmh,
        locationSource: matchedBus?.locationSource || 'NONE',
        nextStopName: matchedBus?.nextStopName,
        etaNextStopMin: matchedBus?.etaNextStopMin,
        waypoints,
        unresolvedStops,
        eligibleBuses: matchedBuses,
        searchId: currentSearchId,
      });
    } else {
      // Record candidates for 1-transfer routing if origin or destination matches
      if (originIndex !== -1) {
        validRoutesForLeg1.push({ route: r, originIdx: originIndex, allStops });
      }
      if (destIndex !== -1) {
        validRoutesForLeg2.push({ route: r, destIdx: destIndex, allStops });
      }
    }
  });

  // Sort direct matches: exact route filter match first, then active buses, then fewest intermediate stops
  directMatches.sort((a, b) => {
    if (cleanFilter) {
      const aExact = a.routeNumber.toUpperCase().replace(/\s+/g, '') === cleanFilter ? 1 : 0;
      const bExact = b.routeNumber.toUpperCase().replace(/\s+/g, '') === cleanFilter ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
    }
    const aBus = a.hasLiveGps ? 1 : 0;
    const bBus = b.hasLiveGps ? 1 : 0;
    if (aBus !== bBus) return bBus - aBus;
    return a.intermediateStopsCount - b.intermediateStopsCount;
  });

  // If no direct matches, evaluate 1-transfer options
  const transferMatches: TransferJourney[] = [];
  if (directMatches.length === 0) {
    for (const leg1 of validRoutesForLeg1.slice(0, 40)) {
      // Available transfer stops on leg1 after the passenger's origin
      const potentialTransfers = leg1.allStops.slice(leg1.originIdx + 1);

      for (const leg2 of validRoutesForLeg2.slice(0, 40)) {
        if (leg1.route.route === leg2.route.route) continue;
        if (cleanFilter && !filterMatches(leg1.route.route) && !filterMatches(leg2.route.route)) {
          continue;
        }

        // Available stops on leg2 before the passenger's destination
        const leg2Prefix = leg2.allStops.slice(0, leg2.destIdx);

        for (const tStop of potentialTransfers) {
          const leg2TransferIdx = leg2Prefix.findIndex((s) => isStopMatch(s, tStop));
          if (leg2TransferIdx !== -1) {
            // Found a valid transfer point!
            const leg1Slice = leg1.allStops.slice(
              leg1.originIdx,
              leg1.allStops.indexOf(tStop) + 1
            );
            const leg2Slice = leg2.allStops.slice(leg2TransferIdx, leg2.destIdx + 1);

            const mLeg1: MatchedJourney = {
              id: `leg1_${leg1.route.route}`,
              routeNumber: leg1.route.route,
              origin: leg1.route.origin,
              destination: leg1.route.destination,
              passengerOrigin: leg1.allStops[leg1.originIdx],
              passengerDestination: tStop,
              allStops: leg1.allStops,
              viaStops: parseViaStops(leg1.route.via),
              journeyStops: leg1Slice,
              intermediateStopsCount: Math.max(0, leg1Slice.length - 2),
              estimatedDurationMin: Math.round(leg1Slice.length * 2.8 + 6),
              distanceKm: Number((leg1Slice.length * 1.6).toFixed(1)),
              category: leg1.route.category || 'Regular Route',
              color: '#3b82f6',
              hasLiveGps: false,
              waypoints: leg1Slice
                .map((s) => getCoordinatesForStop(s))
                .filter(Boolean) as [number, number][],
              unresolvedStops: [],
              searchId: currentSearchId,
            };

            const mLeg2: MatchedJourney = {
              id: `leg2_${leg2.route.route}`,
              routeNumber: leg2.route.route,
              origin: leg2.route.origin,
              destination: leg2.route.destination,
              passengerOrigin: tStop,
              passengerDestination: leg2.allStops[leg2.destIdx],
              allStops: leg2.allStops,
              viaStops: parseViaStops(leg2.route.via),
              journeyStops: leg2Slice,
              intermediateStopsCount: Math.max(0, leg2Slice.length - 2),
              estimatedDurationMin: Math.round(leg2Slice.length * 2.8 + 6),
              distanceKm: Number((leg2Slice.length * 1.6).toFixed(1)),
              category: leg2.route.category || 'Regular Route',
              color: '#8b5cf6',
              hasLiveGps: false,
              waypoints: leg2Slice
                .map((s) => getCoordinatesForStop(s))
                .filter(Boolean) as [number, number][],
              unresolvedStops: [],
              searchId: currentSearchId,
            };

            transferMatches.push({
              id: `transfer_${leg1.route.route}_${leg2.route.route}_${tStop}`,
              origin: leg1.allStops[leg1.originIdx],
              destination: leg2.allStops[leg2.destIdx],
              transferStop: tStop,
              leg1: mLeg1,
              leg2: mLeg2,
              totalDurationMin: mLeg1.estimatedDurationMin + mLeg2.estimatedDurationMin + 8, // +8 min transfer buffer
              totalDistanceKm: Number((mLeg1.distanceKm + mLeg2.distanceKm).toFixed(1)),
            });

            break; // found one valid transfer for this pair
          }
        }
      }
      if (transferMatches.length >= 5) break;
    }
  }

  return { direct: directMatches, transfers: transferMatches };
}
