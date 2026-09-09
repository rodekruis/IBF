import { getNormalizedStringList } from '@api-service/src/utils/normalize-string-list.helper';

describe('getNormalizedStringList', () => {
  it('should return undefined when no values are given', () => {
    // Arrange
    const values = undefined;

    // Act
    const result = getNormalizedStringList(values);

    // Assert
    expect(result).toBeUndefined();
  });

  it('should trim each value', () => {
    // Arrange
    const values = [' MWI ', 'UGA '];

    // Act
    const result = getNormalizedStringList(values);

    // Assert
    expect(result).toEqual(['MWI', 'UGA']);
  });

  it('should remove duplicates', () => {
    // Arrange
    const values = ['MWI', ' MWI', 'UGA'];

    // Act
    const result = getNormalizedStringList(values);

    // Assert
    expect(result).toEqual(['MWI', 'UGA']);
  });

  it('should return undefined when all values are empty', () => {
    // Arrange
    const values = ['', '   '];

    // Act
    const result = getNormalizedStringList(values);

    // Assert
    expect(result).toBeUndefined();
  });
});
