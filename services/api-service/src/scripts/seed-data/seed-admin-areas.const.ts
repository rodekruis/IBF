const GITHUB_RAW_BASE_URL =
  'https://raw.githubusercontent.com/rodekruis/IBF-seed-data/refs/heads/main/admin-areas/processed';

export function getAdminAreaFileUrl(
  countryCodeIso3: string,
  adminLevel: number,
): string {
  return `${GITHUB_RAW_BASE_URL}/${countryCodeIso3}_adm${adminLevel}.json`;
}
