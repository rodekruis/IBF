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
            getAdminAreas: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get(AdminAreasService);
    repository = module.get(AdminAreasRepository);
  });

  describe('getAdminAreas', () => {
    it('should query by countryCodeIso3 and adminLevel', async () => {
      await service.getAdminAreas({ countryCodeIso3: 'ETH', adminLevel: 1 });

      expect(repository.getAdminAreas).toHaveBeenCalledWith({
        countryCodeIso3: 'ETH',
        adminLevel: 1,
      });
    });

    it('should query by countryCodeIso3 only when adminLevel is omitted', async () => {
      await service.getAdminAreas({ countryCodeIso3: 'ETH' });

      expect(repository.getAdminAreas).toHaveBeenCalledWith({
        countryCodeIso3: 'ETH',
        adminLevel: undefined,
      });
    });
  });
});
