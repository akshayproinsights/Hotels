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
