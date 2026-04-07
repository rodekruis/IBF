import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { AlertsController } from '@api-service/src/alerts/alerts.controller';
import { AlertsService } from '@api-service/src/alerts/alerts.service';
import { ReadAlertDto } from '@api-service/src/alerts/dto/alert.dto';

jest.mock('@api-service/src/guards/authenticated-user.guard', () => ({
  AuthenticatedUserGuard: class MockAuthenticatedUserGuard {},
}));

describe('AlertsController', () => {
  let controller: AlertsController;
  let service: AlertsService;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AlertsController],
      providers: [
        {
          provide: AlertsService,
          useValue: {
            getAlerts: jest.fn(),
            getAlertOrThrow: jest.fn(),
            deleteAlertOrThrow: jest.fn(),
            createAlerts: jest.fn(),
          },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get(AlertsController);
    service = module.get(AlertsService);
    reflector = module.get(Reflector);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAlerts', () => {
    it('should return all alerts from the service', async () => {
      const mockAlerts = [{ id: 1 }] as ReadAlertDto[];
      jest.mocked(service.getAlerts).mockResolvedValue(mockAlerts);

      const result = await controller.getAlerts();

      expect(service.getAlerts).toHaveBeenCalled();
      expect(result).toBe(mockAlerts);
    });
  });

  describe('getAlert', () => {
    it('should return the alert for the given id', async () => {
      const mockAlert = { id: 1 } as ReadAlertDto;
      jest.mocked(service.getAlertOrThrow).mockResolvedValue(mockAlert);

      const result = await controller.getAlert(1);

      expect(service.getAlertOrThrow).toHaveBeenCalledWith(1);
      expect(result).toBe(mockAlert);
    });

    it('should propagate NotFoundException when alert is not found', async () => {
      jest
        .mocked(service.getAlertOrThrow)
        .mockRejectedValue(new NotFoundException('Alert with id 99 not found'));

      await expect(controller.getAlert(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAlert', () => {
    it('should delete the alert for the given id', async () => {
      jest.mocked(service.deleteAlertOrThrow).mockResolvedValue(undefined);

      await controller.deleteAlert(1);

      expect(service.deleteAlertOrThrow).toHaveBeenCalledWith(1);
    });

    it('should propagate NotFoundException when alert is not found', async () => {
      jest
        .mocked(service.deleteAlertOrThrow)
        .mockRejectedValue(new NotFoundException('Alert with id 99 not found'));

      await expect(controller.deleteAlert(99)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should require admin access', () => {
      const metadata = reflector.get(
        'authenticationParameters',
        controller.deleteAlert,
      );

      expect(metadata).toMatchObject({ isAdmin: true });
    });
  });
});
