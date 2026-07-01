import { HttpStatus } from '@nestjs/common';

import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import {
  AlertClass,
  AlertClassificationLevel,
  HazardType,
} from '@api-service/src/shared-enums';
import {
  getAccessToken,
  getServer,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

describe('/ Alert Configs', () => {
  let accessToken: string;

  beforeAll(async () => {
    await resetDB(SeedScript.ethiopiaOnly, __filename);
    accessToken = await getAccessToken();
  });

  const validAlertConfig = {
    countryCodeIso3: 'ETH',
    hazardType: HazardType.floods,
    spatialExtentName: 'TEST_STATION',
    spatialExtentPlaceCodes: ['ET0101'],
    temporalExtents: [{ 'lead-time-spectrum': ['0-day', '1-day', '2-day'] }],
    severityClassLevels: [
      { label: AlertClassificationLevel.low, threshold: 100 },
      { label: AlertClassificationLevel.medium, threshold: 200 },
      { label: AlertClassificationLevel.high, threshold: 400 },
    ],
    probabilityClassLevels: [
      { label: AlertClassificationLevel.low, threshold: 0.5 },
      { label: AlertClassificationLevel.medium, threshold: 0.65 },
      { label: AlertClassificationLevel.high, threshold: 0.85 },
    ],
    triggerAlertClass: AlertClass.high,
    triggerLeadTimeDuration: 'P7D',
  };

  describe('POST /alert-configs', () => {
    it('should create an alert config', async () => {
      const response = await getServer()
        .post('/alert-configs')
        .set('Cookie', [accessToken])
        .send(validAlertConfig);

      expect(response.status).toBe(HttpStatus.CREATED);
      expect(response.body.id).toBeDefined();
      expect(response.body.countryCodeIso3).toBe('ETH');
      expect(response.body.hazardType).toBe(HazardType.floods);
      expect(response.body.spatialExtentName).toBe('TEST_STATION');
      expect(response.body.spatialExtentPlaceCodes).toEqual(['ET0101']);
    });

    it('should reject invalid hazard type', async () => {
      const response = await getServer()
        .post('/alert-configs')
        .set('Cookie', [accessToken])
        .send({ ...validAlertConfig, hazardType: 'invalid' });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /alert-configs', () => {
    it('should return alert configs filtered by country and hazard type', async () => {
      const response = await getServer()
        .get('/alert-configs')
        .query({ countryCodeIso3: 'ETH', hazardType: HazardType.floods })
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.length).toBeGreaterThan(0);

      for (const config of response.body) {
        expect(config.countryCodeIso3).toBe('ETH');
        expect(config.hazardType).toBe(HazardType.floods);
      }
    });

    it('should return empty array for country with no configs of given type', async () => {
      const response = await getServer()
        .get('/alert-configs')
        .query({ countryCodeIso3: 'XXX', hazardType: HazardType.drought })
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toEqual([]);
    });

    it('should reject invalid hazard type query parameter', async () => {
      const response = await getServer()
        .get('/alert-configs')
        .query({ countryCodeIso3: 'ETH', hazardType: 'typhoon' })
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('DELETE /alert-configs/:id', () => {
    it('should delete an existing alert config', async () => {
      const createResponse = await getServer()
        .post('/alert-configs')
        .set('Cookie', [accessToken])
        .send({
          ...validAlertConfig,
          spatialExtentName: 'TO_DELETE_STATION',
        });

      expect(createResponse.status).toBe(HttpStatus.CREATED);
      const id = createResponse.body.id;

      const deleteResponse = await getServer()
        .delete(`/alert-configs/${id}`)
        .set('Cookie', [accessToken]);

      expect(deleteResponse.status).toBe(HttpStatus.NO_CONTENT);

      const getResponse = await getServer()
        .get('/alert-configs')
        .query({ countryCodeIso3: 'ETH', hazardType: HazardType.floods })
        .set('Cookie', [accessToken]);

      const deleted = getResponse.body.find((c: { id: number }) => c.id === id);
      expect(deleted).toBeUndefined();
    });

    it('should return 404 for non-existent id', async () => {
      const response = await getServer()
        .delete('/alert-configs/999999')
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
