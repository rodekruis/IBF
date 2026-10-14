import { EPSG } from '@api-service/src/shared/enum/epsg.enum';
import { LayerName } from '@api-service/src/shared-enums';
import { getServer } from '@api-service/test/helpers/utility.helper';

// 1x1 valid PNG, base64-encoded
const MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

export function createStaticRaster({
  accessToken,
  countryCodeIso3,
  layer,
}: {
  accessToken: string;
  countryCodeIso3: string;
  layer: LayerName;
}) {
  return getServer()
    .put('/rasters/static')
    .set('Cookie', [accessToken])
    .field('countryCodeIso3', countryCodeIso3)
    .field('layer', layer)
    .attach('data', Buffer.from(MINIMAL_PNG_BASE64, 'base64'), 'data.png')
    .attach(
      'metadata',
      Buffer.from(
        JSON.stringify({
          transform: [1, 0, 33.0, 0, -1, 15.0, 0, 0, 1],
          crs: EPSG.WGS84,
          width: 1,
          height: 1,
        }),
      ),
      'metadata.json',
    );
}
