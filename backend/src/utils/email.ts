const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalize an email address for storage and comparison.
 *
 * Rules applied in order (no user-visible feedback):
 *  - trim surrounding whitespace
 *  - lowercase the entire address (folded case)
 *  - normalize the domain to lowercase and punycode-encode international domains
 *  - validate the shape with a conservative RFC 5322-inspired regex
 *
 * Throws on malformed input so the caller can return a generic
 * VALIDATION_ERROR without leaking whether the format is wrong.
 */
export function normalizeEmail(rawEmail: string): string {
  if (typeof rawEmail !== 'string') {
    throw new Error('Invalid email format.');
  }

  const trimmed = rawEmail.trim();
  if (!EMAIL_REGEX.test(trimmed)) {
    throw new Error('Invalid email format.');
  }

  const atSeparator = trimmed.lastIndexOf('@');
  if (atSeparator <= 0 || atSeparator === trimmed.length - 1) {
    throw new Error('Invalid email format.');
  }

  // Fold local part to lowercase (RFC 5321/5322 case-folding for the ASCII subset).
  const local = trimmed.slice(0, atSeparator).toLowerCase();

  // Domain: lowercase and punycode-encode IDN labels (A-label) using the URL
  // parser (available in every Node runtime, unlike the legacy punycode module).
  let normalizedDomain: string;
  try {
    normalizedDomain = new URL(`http://${trimmed.slice(atSeparator + 1)}`)
      .hostname;
  } catch {
    throw new Error('Invalid email format.');
  }

  const normalized = `${local}@${normalizedDomain}`;
  if (!EMAIL_REGEX.test(normalized)) {
    throw new Error('Invalid email format.');
  }

  return normalized;
}
