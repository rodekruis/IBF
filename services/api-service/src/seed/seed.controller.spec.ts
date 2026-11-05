import { BadRequestException, ParseArrayPipe } from '@nestjs/common';

import { MockScenario } from '@api-service/src/seed/enum/mock-scenario.enum';
import { SeedController } from '@api-service/src/seed/seed.controller';
import { SeedService } from '@api-service/src/seed/seed.service';
import { HazardType } from '@api-service/src/shared-enums';

jest.mock('@api-service/src/env', () => ({
  env: { RESET_SECRET: 'test-secret' },
}));

jest.mock('@api-service/src/config', () => ({
  IS_PRODUCTION: false,
}));

describe('SeedController – countryCodes parsing', () => {
  const pipe = new ParseArrayPipe({ items: String, optional: true });

  it('should parse comma-separated string into array', async () => {
    const result = await pipe.transform('MWI,UGA', {
      type: 'query',
      metatype: Array,
      data: 'countryCodes',
    });
    expect(result).toEqual(['MWI', 'UGA']);
  });

  it('should parse single value into array', async () => {
    const result = await pipe.transform('MWI', {
      type: 'query',
      metatype: Array,
      data: 'countryCodes',
    });
    expect(result).toEqual(['MWI']);
  });

  it('should pass through an already-parsed array', async () => {
    const result = await pipe.transform(['MWI', 'UGA'], {
      type: 'query',
      metatype: Array,
      data: 'countryCodes',
    });
    expect(result).toEqual(['MWI', 'UGA']);
  });

  it('should return undefined when value is undefined', async () => {
    const result = await pipe.transform(undefined, {
      type: 'query',
      metatype: Array,
      data: 'countryCodes',
    });
    expect(result).toBeUndefined();
  });
});

describe('SeedController – hazardTypes parsing', () => {
  const mockSeedService = { mockEvents: jest.fn() };
  const controller = new SeedController(
    mockSeedService as unknown as SeedService,
  );
  const body = { secret: 'test-secret' };
  const defaultArgs = {
    body,
    countryCodes: undefined,
    scenario: MockScenario.events,
    clearEvents: false,
    issuedAt: undefined,
    notify: false,
  };

  beforeEach(() => {
    mockSeedService.mockEvents.mockReset();
  });

  it('should pass undefined when hazardTypes is omitted, mocking all hazard types', async () => {
    // Act
    await controller.mockEvents(
      defaultArgs.body,
      defaultArgs.countryCodes,
      undefined,
      defaultArgs.scenario,
      defaultArgs.clearEvents,
      defaultArgs.issuedAt,
      defaultArgs.notify,
    );

    // Assert
    expect(mockSeedService.mockEvents).toHaveBeenCalledWith(
      expect.objectContaining({ hazardTypes: undefined }), // === all hazard types
    );
  });

  it('should pass through a single valid hazard type', async () => {
    // Act
    await controller.mockEvents(
      defaultArgs.body,
      defaultArgs.countryCodes,
      [HazardType.tropicalCyclone],
      defaultArgs.scenario,
      defaultArgs.clearEvents,
      defaultArgs.issuedAt,
      defaultArgs.notify,
    );

    // Assert
    expect(mockSeedService.mockEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        hazardTypes: [HazardType.tropicalCyclone],
      }),
    );
  });

  it('should pass through multiple valid hazard types', async () => {
    // Act
    await controller.mockEvents(
      defaultArgs.body,
      defaultArgs.countryCodes,
      [HazardType.floods, HazardType.tropicalCyclone],
      defaultArgs.scenario,
      defaultArgs.clearEvents,
      defaultArgs.issuedAt,
      defaultArgs.notify,
    );

    // Assert
    expect(mockSeedService.mockEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        hazardTypes: [HazardType.floods, HazardType.tropicalCyclone],
      }),
    );
  });

  it('should throw BadRequestException for an invalid hazard type', async () => {
    // Act & Assert
    await expect(
      controller.mockEvents(
        defaultArgs.body,
        defaultArgs.countryCodes,
        ['not-a-hazard'],
        defaultArgs.scenario,
        defaultArgs.clearEvents,
        defaultArgs.issuedAt,
        defaultArgs.notify,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(mockSeedService.mockEvents).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException when one of multiple hazard types is invalid', async () => {
    // Act & Assert
    await expect(
      controller.mockEvents(
        defaultArgs.body,
        defaultArgs.countryCodes,
        [HazardType.floods, 'not-a-hazard'],
        defaultArgs.scenario,
        defaultArgs.clearEvents,
        defaultArgs.issuedAt,
        defaultArgs.notify,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(mockSeedService.mockEvents).not.toHaveBeenCalled();
  });
});
