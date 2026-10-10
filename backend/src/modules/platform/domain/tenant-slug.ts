// Same pattern as the CHECK constraint on "Tenant"."slug": lowercase ASCII
// letters and digits in hyphen-separated groups, no leading/trailing hyphen.
export const TENANT_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Derives the public tenant identifier used at login from the company name.
// Returns an empty string when the name has no letter or digit left after
// normalization; callers must treat that as an invalid name.
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
