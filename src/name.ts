const VALID_HOMEKIT_NAME_CHARACTER = /[^A-Za-z0-9 ']/g;
const INVALID_HOMEKIT_NAME_BOUNDARY = /^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g;
const MULTIPLE_SPACES = /\s+/g;

/**
 * HomeKit rejects names that are empty, contain unsupported punctuation, or do
 * not start and end with an alphanumeric character.
 */
export function getHomeKitName(name: string | undefined, fallback = 'Sony Audio'): string {
  const sanitizedName = sanitizeHomeKitName(name);
  if (sanitizedName) {
    return sanitizedName;
  }

  return sanitizeHomeKitName(fallback) || 'Sony Audio';
}

function sanitizeHomeKitName(name: string | undefined): string {
  return (name || '')
    .replace(VALID_HOMEKIT_NAME_CHARACTER, ' ')
    .replace(MULTIPLE_SPACES, ' ')
    .trim()
    .replace(INVALID_HOMEKIT_NAME_BOUNDARY, '');
}
