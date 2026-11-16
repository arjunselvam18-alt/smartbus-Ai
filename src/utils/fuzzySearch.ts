/**
 * Fuzzy search, spelling correction, and stop validation engine
 * Designed specifically for Chennai municipal transit stop names & route numbers.
 */

export interface StopSuggestion {
  canonicalName: string; // The exact name from the Google Sheets database
  score: number; // 0 - 100
  matchType: 'exact' | 'prefix' | 'token' | 'fuzzy' | 'alias';
  isCorrection: boolean; // true if the user had a typo/spelling difference
  highlightStart?: number;
  highlightLength?: number;
}

/**
 * Standard Levenshtein distance between two strings
 */
export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Swap to use smaller row
  let row = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    const newRow = [i];
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      newRow[j] = Math.min(
        newRow[j - 1] + 1, // insertion
        row[j] + 1, // deletion
        row[j - 1] + cost // substitution
      );
    }
    row = newRow;
  }
  return row[n];
}

/**
 * Normalizes stop names for phonetic & spelling tolerance in Tamil Nadu transit data:
 * - strips punctuation, dots, brackets, hyphens
 * - converts double letters (e.g. "ll" -> "l", "kk" -> "k", "tt" -> "t", "rr" -> "r")
 * - collapses common vowel variations (e.g. "iyr" -> "iyur")
 */
export function normalizeForComparison(str: string): string {
  if (!str) return '';
  let s = str.toLowerCase().trim();

  // Remove content in parentheses e.g. "(K.C.B.T)" for core stop matching
  s = s.replace(/\s*\([^)]*\)/g, ' ');

  // Strip all non-alphanumeric except spaces
  s = s.replace(/[^a-z0-9\s]/g, '');

  // Collapse consecutive spaces
  s = s.replace(/\s+/g, ' ').trim();

  // Specific high-frequency Chennai transit aliases
  if (/^(mgr\s*central|chennai\s*central|central\s*railway|central)$/i.test(s)) {
    return 'central';
  }
  if (/^(t\s*nagar|thiyagaraya\s*nagar|t\.nagar)$/i.test(s)) {
    return 'thiyagarayanagar';
  }
  if (/^(koyambedu|cmbt|mgr\s*koyambedu)$/i.test(s)) {
    return 'koyambedu';
  }
  if (/^(kilambakkam|kcbt)$/i.test(s)) {
    return 'kilambakkam';
  }

  // Common spelling equivalence:
  // e.g. Thiruvotriyur <-> Thiruvottiyur
  // e.g. Thiruvanmiyr <-> Thiruvanmiyur
  // e.g. Sholinganlur <-> Sholinganallur
  s = s
    .replace(/miyr\b/g, 'miyur')
    .replace(/vottriyur/g, 'vottiyur')
    .replace(/votriyur/g, 'vottiyur')
    .replace(/nganlur/g, 'nganallur')
    .replace(/mbakam/g, 'mbakkam');

  // Strip spaces for tight Levenshtein
  return s.replace(/\s+/g, '');
}

/**
 * Phonetically simplified representation for fuzzy sound-alike comparison
 */
function phoneticSimplify(str: string): string {
  const norm = normalizeForComparison(str);
  // Collapse double characters: "ll" -> "l", "tt" -> "t", "kk" -> "k", "rr" -> "r", "pp" -> "p", "mm" -> "m", "nn" -> "n"
  return norm.replace(/(.)\1+/g, '$1');
}

/**
 * Computes match score between passenger query and canonical stop name
 */
export function scoreStopMatch(query: string, candidate: string): {
  score: number;
  matchType: 'exact' | 'prefix' | 'token' | 'fuzzy' | 'alias';
  isCorrection: boolean;
} {
  const rawQ = query.trim().toLowerCase();
  const rawC = candidate.trim().toLowerCase();

  // 1. Exact raw match
  if (rawQ === rawC) {
    return { score: 100, matchType: 'exact', isCorrection: false };
  }

  const qNorm = normalizeForComparison(query);
  const cNorm = normalizeForComparison(candidate);

  // 2. Exact normalized match (e.g. "Kilambakkam" vs "Kilambakkam (K.C.B.T)")
  if (qNorm === cNorm) {
    return { score: 98, matchType: 'exact', isCorrection: rawQ !== rawC };
  }

  // Check aliases (e.g. "Central" matching "M.G.R Central", "T. Nagar" matching "Thiyagaraya Nagar")
  if (
    (qNorm === 'central' && (cNorm === 'central' || cNorm === 'mgrcentral' || /\bcentral\b/i.test(rawC))) ||
    (qNorm === 'thiyagarayanagar' &&
      (cNorm === 'thiyagarayanagar' || cNorm === 'tnagar' || /\bt\.?\s*nagar\b/i.test(rawC)))
  ) {
    return { score: 95, matchType: 'alias', isCorrection: false };
  }

  // 3. Prefix match on raw text or candidate tokens
  if (rawC.startsWith(rawQ)) {
    const penalty = Math.min(15, (rawC.length - rawQ.length) * 0.5);
    return { score: 92 - penalty, matchType: 'prefix', isCorrection: false };
  }

  const cTokens = rawC.split(/[\s,()\-]+/);
  if (cTokens.some((t) => t.startsWith(rawQ))) {
    return { score: 88, matchType: 'prefix', isCorrection: false };
  }

  // 4. Normalized prefix match
  if (cNorm.startsWith(qNorm)) {
    const penalty = Math.min(15, (cNorm.length - qNorm.length) * 0.5);
    return { score: 86 - penalty, matchType: 'prefix', isCorrection: true };
  }

  // 5. Contains as substring
  if (rawC.includes(rawQ) && rawQ.length >= 3) {
    return { score: 82, matchType: 'token', isCorrection: false };
  }
  if (cNorm.includes(qNorm) && qNorm.length >= 3) {
    return { score: 80, matchType: 'token', isCorrection: true };
  }

  // 6. Phonetic sound-alike match (handles missing doubled consonants or minor vowel shifts)
  const qPhonetic = phoneticSimplify(query);
  const cPhonetic = phoneticSimplify(candidate);

  if (qPhonetic === cPhonetic) {
    // Exact sound-alike match! (e.g. "Kilambakam" vs "Kilambakkam", "Sholinganlur" vs "Sholinganallur")
    return { score: 85, matchType: 'fuzzy', isCorrection: true };
  }
  if (cPhonetic.startsWith(qPhonetic) && qPhonetic.length >= 4) {
    return { score: 78, matchType: 'fuzzy', isCorrection: true };
  }

  // 7. Levenshtein edit distance on normalized strings
  const dist = levenshteinDistance(qNorm, cNorm);
  const maxLen = Math.max(qNorm.length, cNorm.length);
  const similarity = 1 - dist / maxLen;

  // Allow distance up to 1 for short queries (4-6 chars), up to 2 for 7-10 chars, up to 3 for >10 chars
  const allowedDist = qNorm.length <= 5 ? 1 : qNorm.length <= 10 ? 2 : 3;

  if (dist <= allowedDist && similarity >= 0.65) {
    // Strong fuzzy match!
    const fuzzyScore = Math.round(75 * similarity);
    return { score: fuzzyScore, matchType: 'fuzzy', isCorrection: true };
  }

  // Check Levenshtein against individual tokens for compound stop names
  for (const token of cTokens) {
    const tokenNorm = normalizeForComparison(token);
    if (tokenNorm.length >= 4) {
      const tDist = levenshteinDistance(qNorm, tokenNorm);
      if (tDist <= (qNorm.length <= 6 ? 1 : 2)) {
        const tSim = 1 - tDist / Math.max(qNorm.length, tokenNorm.length);
        if (tSim >= 0.7) {
          return { score: Math.round(70 * tSim), matchType: 'fuzzy', isCorrection: true };
        }
      }
    }
  }

  return { score: 0, matchType: 'token', isCorrection: false };
}

/**
 * Generates intelligent autocomplete and spelling correction suggestions
 * for any passenger stop query based on the complete Google Sheets stops list.
 */
export function getSmartStopSuggestions(
  query: string,
  allStops: string[],
  maxResults = 8
): StopSuggestion[] {
  if (!query || !query.trim()) return [];
  const cleanQ = query.trim();

  // Deduplicate case-variations while preserving canonical display names
  const uniqueStops = Array.from(new Set(allStops.map((s) => s.trim()).filter(Boolean)));

  const scored: StopSuggestion[] = [];

  for (const stop of uniqueStops) {
    const { score, matchType, isCorrection } = scoreStopMatch(cleanQ, stop);
    if (score >= 55) {
      scored.push({
        canonicalName: stop,
        score,
        matchType,
        isCorrection,
      });
    }
  }

  // Sort by score descending, then shorter length first
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.canonicalName.length - b.canonicalName.length;
  });

  return scored.slice(0, maxResults);
}

/**
 * Validates whether an entered stop name is acceptable or needs user selection
 */
export function validateStopInput(
  input: string,
  allStops: string[]
): {
  isValid: boolean;
  matchedCanonical?: string;
  suggestions: StopSuggestion[];
  isAmbiguous: boolean;
  message?: string;
} {
  if (!input || !input.trim()) {
    return {
      isValid: false,
      suggestions: [],
      isAmbiguous: false,
      message: 'Please enter a bus stop name.',
    };
  }

  const trimmed = input.trim();
  const suggestions = getSmartStopSuggestions(trimmed, allStops, 6);

  if (suggestions.length === 0) {
    return {
      isValid: false,
      suggestions: [],
      isAmbiguous: false,
      message: 'No matching bus stop found in Chennai route database.',
    };
  }

  const topMatch = suggestions[0];

  // Exact match
  if (topMatch.score >= 95) {
    return {
      isValid: true,
      matchedCanonical: topMatch.canonicalName,
      suggestions,
      isAmbiguous: false,
    };
  }

  // Check if ambiguous (e.g. top 2-3 suggestions have almost identical score >= 70)
  if (
    suggestions.length > 1 &&
    suggestions[1].score >= 70 &&
    Math.abs(topMatch.score - suggestions[1].score) <= 5
  ) {
    return {
      isValid: false,
      suggestions,
      isAmbiguous: true,
      message: `Multiple similar stops found. Please select one: ${suggestions.slice(0, 3).map((s) => s.canonicalName).join(', ')}`,
    };
  }

  // Single strong fuzzy/spelling suggestion
  if (topMatch.score >= 70) {
    return {
      isValid: true,
      matchedCanonical: topMatch.canonicalName,
      suggestions,
      isAmbiguous: false,
      message: topMatch.isCorrection
        ? `Matched to '${topMatch.canonicalName}' (Spelling correction for '${trimmed}')`
        : undefined,
    };
  }

  return {
    isValid: false,
    suggestions,
    isAmbiguous: true,
    message: 'Please select a verified bus stop from the suggestions.',
  };
}

/**
 * Autocompletes and matches route numbers (e.g., 95X, 555S, 21G, 570)
 * from actual Google Sheets route records with case-insensitive and minor spelling tolerance.
 */
export function getSmartRouteSuggestions(
  query: string,
  allRouteNumbers: string[],
  maxResults = 6
): string[] {
  if (!query || !query.trim()) return [];
  const cleanQ = query.trim().toUpperCase().replace(/\s+/g, '');

  const uniqueRoutes = Array.from(
    new Set(allRouteNumbers.map((r) => r.trim()).filter((r) => r.length > 0))
  );

  const matched = uniqueRoutes.filter((route) => {
    const cleanR = route.toUpperCase().replace(/\s+/g, '');
    if (cleanR === cleanQ) return true;
    if (cleanR.startsWith(cleanQ)) return true;
    if (cleanR.includes(cleanQ)) return true;
    // Handle minor typo in route number (e.g. missing suffix or letter)
    if (cleanQ.length >= 2 && levenshteinDistance(cleanQ, cleanR) <= 1) return true;
    return false;
  });

  // Sort: exact matches first, then prefix matches, then shorter numbers
  matched.sort((a, b) => {
    const cleanA = a.toUpperCase().replace(/\s+/g, '');
    const cleanB = b.toUpperCase().replace(/\s+/g, '');
    if (cleanA === cleanQ) return -1;
    if (cleanB === cleanQ) return 1;
    if (cleanA.startsWith(cleanQ) && !cleanB.startsWith(cleanQ)) return -1;
    if (!cleanA.startsWith(cleanQ) && cleanB.startsWith(cleanQ)) return 1;
    return cleanA.length - cleanB.length;
  });

  return matched.slice(0, maxResults);
}
