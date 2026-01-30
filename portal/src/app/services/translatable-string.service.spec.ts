import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { TranslatableStringService } from '~/services/translatable-string.service';

describe('TranslatableStringService', () => {
  let service: TranslatableStringService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TranslatableStringService,
        { provide: LOCALE_ID, useValue: 'nl' },
      ],
    });
    service = TestBed.inject(TranslatableStringService);
  });

  describe('translate', () => {
    it('should return undefined for null', () => {
      expect(service.translate(null)).toBeUndefined();
    });

    it('should return undefined for undefined', () => {
      expect(service.translate(undefined)).toBeUndefined();
    });

    it('should return undefined for empty translation object', () => {
      expect(service.translate({})).toBeUndefined();
    });

    it('should return number as string', () => {
      expect(service.translate(123)).toBe('123');
    });

    it('should return string as is', () => {
      expect(service.translate('hello')).toBe('hello');
    });
  });

  describe('commaSeparatedList', () => {
    it('should return comma separated string for array of strings', () => {
      const result = service.commaSeparatedList({ values: ['a', 'b', 'c'] });
      expect(result).toContain('a');
      expect(result).toContain('b');
      expect(result).toContain('c');
    });

    it('should handle empty array', () => {
      expect(service.commaSeparatedList({ values: [] })).toBe('');
    });
  });
});
