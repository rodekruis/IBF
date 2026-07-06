import { HttpStatus } from '@nestjs/common';

import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import {
  getAccessToken,
  getServer,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

describe('/ Countries', () => {
  let accessToken: string;

  beforeAll(async () => {
    await resetDB(SeedScript.ethiopiaOnly, __filename);
    accessToken = await getAccessToken();
  });

  describe('GET /countries', () => {
    it('should return all countries', async () => {
      const response = await getServer()
        .get('/countries')
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.OK);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].countryCodeIso3).toBeDefined();
    });
  });

  describe('GET /countries/:countryCodeIso3', () => {
    it('should return a country by ISO3 code', async () => {
      const response = await getServer()
        .get('/countries/ETH')
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.countryCodeIso3).toBe('ETH');
    });

    it('should return 404 for non-existent country', async () => {
      const response = await getServer()
        .get('/countries/XXX')
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('POST /countries', () => {
    it('should create countries', async () => {
      const response = await getServer()
        .post('/countries')
        .set('Cookie', [accessToken])
        .send([
          {
            countryCodeIso3: 'TST',
            countryCodeIso2: 'TS',
            countryName: 'Test Country',
          },
        ]);

      expect(response.status).toBe(HttpStatus.CREATED);
      expect(response.body[0].countryCodeIso3).toBe('TST');
      expect(response.body[0].countryName).toBe('Test Country');
    });

    it('should return 409 for duplicate country', async () => {
      const duplicateCountry = {
        countryCodeIso3: 'DUP',
        countryCodeIso2: 'DP',
        countryName: 'Duplicate Country',
      };

      await getServer()
        .post('/countries')
        .set('Cookie', [accessToken])
        .send([duplicateCountry]);

      const response = await getServer()
        .post('/countries')
        .set('Cookie', [accessToken])
        .send([duplicateCountry]);

      expect(response.status).toBe(HttpStatus.CONFLICT);
    });
  });

  describe('PATCH /countries/:countryCodeIso3', () => {
    it('should update a country', async () => {
      await getServer()
        .post('/countries')
        .set('Cookie', [accessToken])
        .send([
          {
            countryCodeIso3: 'UPD',
            countryCodeIso2: 'UP',
            countryName: 'Update Country',
          },
        ]);

      const response = await getServer()
        .patch('/countries/UPD')
        .set('Cookie', [accessToken])
        .send({ countryName: 'Updated Country' });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.countryName).toBe('Updated Country');
    });

    it('should return 404 for non-existent country', async () => {
      const response = await getServer()
        .patch('/countries/XXX')
        .set('Cookie', [accessToken])
        .send({ countryName: 'Does Not Exist' });

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /countries/:countryCodeIso3', () => {
    it('should delete a country', async () => {
      await getServer()
        .post('/countries')
        .set('Cookie', [accessToken])
        .send([
          {
            countryCodeIso3: 'DEL',
            countryCodeIso2: 'DL',
            countryName: 'Delete Country',
          },
        ]);

      const response = await getServer()
        .delete('/countries/DEL')
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.NO_CONTENT);

      const getResponse = await getServer()
        .get('/countries/DEL')
        .set('Cookie', [accessToken]);

      expect(getResponse.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('should return 404 for non-existent country', async () => {
      const response = await getServer()
        .delete('/countries/XXX')
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
