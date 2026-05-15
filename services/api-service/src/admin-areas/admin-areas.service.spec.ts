import { Test } from '@nestjs/testing';

import { AdminAreasRepository } from '@api-service/src/admin-areas/admin-areas.repository';
import { AdminAreasService } from '@api-service/src/admin-areas/admin-areas.service';

describe('AdminAreasService', () => {
  let service: AdminAreasService;
  let repository: jest.Mocked<AdminAreasRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AdminAreasService,
        {
          provide: AdminAreasRepository,
          useValue: {
            getAdminAreas: jest.fn().mockResolvedValue({
              type: 'FeatureCollection',
              features: [],
              numberReturned: 0,
            }),
          },
        },
      ],
    }).compile();

    service = module.get(AdminAreasService);
    repository = module.get(AdminAreasRepository);
  });

  describe('getAdminAreas', () => {
    it('should forward all query params to the repository', async () => {
      const query = {
        filter: "countryCodeIso3='ETH' AND adminLevel=1",
        limit: '500',
      };

      await service.getAdminAreas(query);

      expect(repository.getAdminAreas).toHaveBeenCalledWith(query);
    });
  });
});
