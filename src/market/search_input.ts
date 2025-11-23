export interface SearchInputAnalysis {
  raw: string;
  normalized: string;
  /**
   * Possible canonical symbol representations, e.g. ["SH600988", "SZ000001"].
   */
  symbolCandidates: string[];
  /**
   * Whether the input is more likely a symbol/code query than a name query.
   */
  isSymbolLike: boolean;
}

const CN_PREFIX_SH = "SH";
const CN_PREFIX_SZ = "SZ";

export function analyzeSearchInput(raw: string): SearchInputAnalysis {
  const normalized = normalize(raw);
  const symbolCandidates = Array.from(buildSymbolCandidates(normalized));
  return {
    raw,
    normalized,
    symbolCandidates,
    isSymbolLike: symbolCandidates.length > 0,
  };
}

function normalize(value: string): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function buildSymbolCandidates(normalized: string): Set<string> {
  const candidates = new Set<string>();
  if (!normalized) return candidates;

  const cleaned = normalized.replace(/[^A-Z0-9:#]/g, "");
  const codeAfterDelimiter = extractAfterDelimiter(cleaned);
  if (codeAfterDelimiter) candidates.add(codeAfterDelimiter);

  if (/^[A-Z]{1,4}\d{3,}$/.test(cleaned)) {
    candidates.add(cleaned);
  }

  const digitsOnly = cleaned.replace(/\D/g, "");
  if (digitsOnly.length >= 3) {
    candidates.add(digitsOnly);
    for (const variant of buildCnSymbolVariants(digitsOnly)) {
      candidates.add(variant);
    }
  }

  return candidates;
}

function extractAfterDelimiter(input: string): string | undefined {
  const parts = input.split(/[:#]/).filter(Boolean);
  if (parts.length === 2) {
    return `${parts[0]}${parts[1]}`;
  }
  return undefined;
}

function buildCnSymbolVariants(code: string): string[] {
  if (!/^\d{3,}$/.test(code)) return [];
  const variants: string[] = [];
  const leading = code[0];
  if (leading === "6") {
    variants.push(`${CN_PREFIX_SH}${code}`);
  } else if (leading === "0" || leading === "3") {
    variants.push(`${CN_PREFIX_SZ}${code}`);
  }
  return variants;
}
