import { ConflictException } from '@nestjs/common';

jest.mock('@api-service/src/env', () => ({
  env: {},
}));

import { SeedService } from '@api-service/src/seed/seed.service';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('SeedService', () => {
  let service: SeedService;
  let seedInitRunMock: jest.Mock;

  beforeEach(() => {
    seedInitRunMock = jest.fn().mockResolvedValue(undefined);

    const seedInit = { run: seedInitRunMock } as never;
    const alertsService = {} as never;
    const countriesService = {} as never;
    const eventsService = {} as never;

    service = new SeedService(
      seedInit,
      alertsService,
      countriesService,
      eventsService,
    );
  });

  describe('startReset', () => {
    it('should return immediately without awaiting seedInit.run', () => {
      let resolved = false;
      seedInitRunMock.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              resolved = true;
              resolve();
            }, 1000);
          }),
      );

      service.startReset({});

      expect(resolved).toBe(false);
      expect(seedInitRunMock).toHaveBeenCalledTimes(1);
    });

    it('should set inProgress to true while running', () => {
      seedInitRunMock.mockReturnValue(new Promise(() => undefined));

      service.startReset({});

      expect(service.getResetStatus()).toEqual({
        inProgress: true,
        error: null,
      });
    });

    it('should set inProgress to false after completion', async () => {
      service.startReset({});

      await flushPromises();

      expect(service.getResetStatus()).toEqual({
        inProgress: false,
        error: null,
      });
    });

    it('should throw ConflictException if reset is already in progress', () => {
      seedInitRunMock.mockReturnValue(new Promise(() => undefined));

      service.startReset({});

      expect(() => service.startReset({})).toThrow(ConflictException);
    });

    it('should record error message on failure', async () => {
      seedInitRunMock.mockRejectedValue(new Error('Connection lost'));

      service.startReset({});

      await flushPromises();

      expect(service.getResetStatus()).toEqual({
        inProgress: false,
        error: 'Connection lost',
      });
    });

    it('should allow a new reset after a previous one completes', async () => {
      service.startReset({});
      await flushPromises();

      expect(() => service.startReset({})).not.toThrow();
    });

    it('should clear previous error on new reset', async () => {
      seedInitRunMock.mockRejectedValueOnce(new Error('fail'));
      service.startReset({});
      await flushPromises();

      seedInitRunMock.mockResolvedValueOnce(undefined);
      service.startReset({});
      await flushPromises();

      expect(service.getResetStatus()).toEqual({
        inProgress: false,
        error: null,
      });
    });

    it('should pass countryCodes and skipStaticRasters to seedInit.run', () => {
      service.startReset({
        countryCodes: ['MWI', 'UGA'],
        skipStaticRasters: true,
      });

      expect(seedInitRunMock).toHaveBeenCalledWith({
        countryCodes: ['MWI', 'UGA'],
        skipStaticRasters: true,
      });
    });
  });

  describe('getResetStatus', () => {
    it('should return idle status initially', () => {
      expect(service.getResetStatus()).toEqual({
        inProgress: false,
        error: null,
      });
    });
  });
});
