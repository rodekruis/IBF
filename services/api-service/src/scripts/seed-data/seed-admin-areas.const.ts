import { SEED_REPO_RAW_BASE_URL } from '@api-service/src/scripts/seed-init';

const ADMIN_AREAS_PATH = '/admin-areas/processed';

export function getAdminAreaFileUrl(
  countryCodeIso3: string,
  adminLevel: number,
): string {
  return `${SEED_REPO_RAW_BASE_URL}${ADMIN_AREAS_PATH}/${countryCodeIso3}_adm${adminLevel}.json`;
}
