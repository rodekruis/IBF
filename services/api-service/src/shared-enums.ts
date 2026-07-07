// Enums shared between the api-service, the pipelines, and the front end.
// When adding enums here, follow the full updating flow.
// See `Updating Shared Enums` in the README for details.

export { EPSG } from './shared/enum/epsg.enum';
export {
  AlertClass,
  AlertClassificationLevel, // Not all enums are actually used as database column types, yet we still define them all in one place (postgres datamodel) for consistency
  EnsembleMemberType,
  ForecastSource,
  HazardType,
  LayerName,
  LayerType,
  SeverityKey,
} from '@prisma/client'; // See schema.prisma for all enums with their members
