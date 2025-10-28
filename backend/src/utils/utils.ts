import crypto from 'crypto';
import { ColumnType, type EmailAuthConfigSchema } from '@insforge/shared-schemas';

/**
 * Generates a user-friendly error message listing all password requirements
 * @param config - Email authentication configuration with password requirements
 * @returns A formatted message listing all enabled password requirements
 */
export function getPasswordRequirementsMessage(config: EmailAuthConfigSchema): string {
  const requirements: string[] = [];

  requirements.push(`at least ${config.passwordMinLength} characters long`);

  if (config.requireNumber) {
    requirements.push('at least one number');
  }

  if (config.requireLowercase) {
    requirements.push('at least one lowercase letter');
  }

  if (config.requireUppercase) {
    requirements.push('at least one uppercase letter');
  }

  if (config.requireSpecialChar) {
    requirements.push('at least one special character');
  }

  return `Password must contain ${requirements.join(', ')}`;
}

export const convertSqlTypeToColumnType = (sqlType: string): ColumnType | string => {
  switch (sqlType.toLowerCase()) {
    case 'uuid':
      return ColumnType.UUID;
    case 'timestamptz':
    case 'timestamp with time zone':
      return ColumnType.DATETIME;
    case 'date':
      return ColumnType.DATE;
    case 'integer':
    case 'bigint':
    case 'smallint':
    case 'int':
    case 'int2':
    case 'int4':
    case 'serial':
    case 'serial2':
    case 'serial4':
    case 'serial8':
    case 'smallserial':
    case 'bigserial':
      return ColumnType.INTEGER;
    case 'double precision':
    case 'real':
    case 'numeric':
    case 'float':
    case 'float4':
    case 'float8':
    case 'decimal':
      return ColumnType.FLOAT;
    case 'boolean':
    case 'bool':
      return ColumnType.BOOLEAN;
    case 'json':
    case 'jsonb':
    case 'array':
      return ColumnType.JSON;
    case 'text':
    case 'varchar':
    case 'char':
    case 'character varying':
    case 'character':
      return ColumnType.STRING;
    default:
      return sqlType.slice(0, 5);
  }
};

/**
 * Generate a UUID v4
 * @returns A UUID v4 string
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Generate a random numeric string of specified length
 * @param length - The length of the numeric string to generate
 * @returns A random string containing only digits (0-9)
 */
export function generateNumericCode(length: number): string {
  if (length <= 0) {
    throw new Error('Length must be greater than 0');
  }

  // Generate a random number with the specified length
  const max = Math.pow(10, length);
  const randomNum = crypto.randomInt(0, max);

  // Pad with leading zeros to ensure exact length
  return randomNum.toString().padStart(length, '0');
}
