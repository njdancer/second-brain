/**
 * Tests for feature flag schema registry
 */

import { FlagSchemas, getSchemaDefaults, type FlagValues } from '../../../src/feature-flags/schemas';

describe('Feature Flag Schemas', () => {
  describe('FlagSchemas', () => {
    it('should define EXAMPLE_FEATURE flag', () => {
      expect(FlagSchemas).toHaveProperty('EXAMPLE_FEATURE');
    });

    it('should validate boolean flag values', () => {
      const schema = FlagSchemas.EXAMPLE_FEATURE;

      // Valid values
      expect(schema.safeParse(true).success).toBe(true);
      expect(schema.safeParse(false).success).toBe(true);

      // Invalid values
      expect(schema.safeParse('true').success).toBe(false);
      expect(schema.safeParse(1).success).toBe(false);
      expect(schema.safeParse(null).success).toBe(false);
    });

    it('should provide default values for flags', () => {
      const schema = FlagSchemas.EXAMPLE_FEATURE;
      const result = schema.safeParse(undefined);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });
  });

  describe('getSchemaDefaults', () => {
    it('should return default values for all flags', () => {
      const defaults = getSchemaDefaults();

      expect(defaults).toHaveProperty('EXAMPLE_FEATURE');
      expect(typeof defaults.EXAMPLE_FEATURE).toBe('boolean');
    });

    it('should return false for EXAMPLE_FEATURE by default', () => {
      const defaults = getSchemaDefaults();
      expect(defaults.EXAMPLE_FEATURE).toBe(false);
    });

    it('should return an object with all flag keys', () => {
      const defaults = getSchemaDefaults();
      const schemaKeys = Object.keys(FlagSchemas);
      const defaultKeys = Object.keys(defaults);

      expect(defaultKeys).toEqual(schemaKeys);
    });
  });

  describe('FlagValues type', () => {
    it('should be a valid type that can be assigned', () => {
      const flags: FlagValues = {
        EXAMPLE_FEATURE: true,
      };

      expect(flags.EXAMPLE_FEATURE).toBe(true);
    });

    it('should enforce type safety for flag values', () => {
      const flags: FlagValues = {
        EXAMPLE_FEATURE: false,
      };

      // TypeScript compile-time check - this would fail:
      // flags.EXAMPLE_FEATURE = 'true'; // Type error

      expect(typeof flags.EXAMPLE_FEATURE).toBe('boolean');
    });
  });
});
