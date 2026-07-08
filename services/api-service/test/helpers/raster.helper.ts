import { EPSG } from '@api-service/src/shared/enum/epsg.enum';
import { LayerName } from '@api-service/src/shared-enums';
import { getServer } from '@api-service/test/helpers/utility.helper';

// 1x1 valid PNG, base64-encoded
const MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

export function createStaticRaster(
  accessToken: string,
  countryCodeIso3: string,
  layer: LayerName,
) {
  return getServer()
    .put('/rasters/static')
    .set('Cookie', [accessToken])
    .send({
      countryCodeIso3,
      layer,
      valueData: MINIMAL_PNG_BASE64,
      valueColoured: MINIMAL_PNG_BASE64,
      metadata: {
        data: {
          extent: { xmin: 33.0, ymin: 3.0, xmax: 48.0, ymax: 15.0 },
          crs: EPSG.WGS84,
          nodata: 0,
        },
        coloured: {
          extent: { xmin: 33.0, ymin: 3.0, xmax: 48.0, ymax: 15.0 },
          crs: EPSG.WGS84,
        },
      },
    });
}
