/**
 * Extracts the Marathi part from a name that contains both English and Marathi.
 * Examples:
 * - "John Doe / जॉन डो" -> "जॉन डो"
 * - "जॉन डो / John Doe" -> "जॉन डो"
 * - "John Doe (जॉन डो)" -> "जॉन डो"
 * - "John Doe - जॉन डो" -> "जॉन डो"
 * - "जॉन डो" -> "जॉन डो"
 * - "John Doe" -> "John Doe" (if no Marathi part exists)
 */
export function getMarathiName(fullName: string): string {
  if (!fullName) return '';

  // Split by common separators: /, -, |, (, )
  const parts = fullName.split(/[\/\-|()]/).map(p => p.trim()).filter(Boolean);

  // Find the first part that contains Devanagari (Marathi) characters
  // Devanagari range: \u0900 to \u097F
  const marathiPart = parts.find(part => /[\u0900-\u097F]/.test(part));

  if (marathiPart) {
    return marathiPart;
  }

  // If no parts matched but the whole name has Devanagari (e.g. not delimited but has Devanagari)
  if (/[\u0900-\u097F]/.test(fullName)) {
    return fullName.trim();
  }

  // Fallback to the original name if no Marathi characters are present at all
  return fullName.trim();
}

/**
 * Shortens a name if it's too long by keeping only the first and last name.
 */
export function shortenLongName(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  
  if (words.length > 2 && trimmed.length > 10) {
    return `${words[0]} ${words[words.length - 1]}`;
  }
  return trimmed;
}

/**
 * Extracts the English part from a name that contains both English and Marathi.
 */
export function getEnglishName(fullName: string): string {
  if (!fullName) return '';

  // Split by common separators: /, -, |, (, )
  const parts = fullName.split(/[\/\-|()]/).map(p => p.trim()).filter(Boolean);

  // Find the first part that contains English (Latin) characters
  const englishPart = parts.find(part => /[a-zA-Z]/.test(part));

  if (englishPart) {
    return englishPart;
  }

  // If no parts matched but the whole name has Latin characters, return trimmed name
  if (/[a-zA-Z]/.test(fullName)) {
    return fullName.trim();
  }

  // Fallback to the original name if no English characters are present at all
  return fullName.trim();
}

/**
 * Formats a name according to the active language mode.
 */
export function formatNameByLanguage(fullName: string | undefined | null, language: string): string {
  if (!fullName) return '';
  if (language === 'mr') {
    return getMarathiName(fullName);
  }
  return getEnglishName(fullName);
}
