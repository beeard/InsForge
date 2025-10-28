import { Pool } from 'pg';
import { DatabaseManager } from '@/core/database/manager.js';
import { AppError } from '@/api/middleware/error.js';
import { ERROR_CODES } from '@/types/error-constants.js';
import logger from '@/utils/logger.js';
import { EmailAuthConfigSchema, UpdateEmailAuthConfigRequest } from '@insforge/shared-schemas';

export class AuthConfigService {
  private static instance: AuthConfigService;
  private pool: Pool | null = null;

  private constructor() {
    logger.info('AuthConfigService initialized');
  }

  public static getInstance(): AuthConfigService {
    if (!AuthConfigService.instance) {
      AuthConfigService.instance = new AuthConfigService();
    }
    return AuthConfigService.instance;
  }

  private getPool(): Pool {
    if (!this.pool) {
      this.pool = DatabaseManager.getInstance().getPool();
    }
    return this.pool;
  }

  /**
   * Get email authentication configuration
   * Returns the singleton configuration row
   */
  async getEmailConfig(): Promise<EmailAuthConfigSchema> {
    const client = await this.getPool().connect();
    try {
      const result = await client.query(
        `SELECT
          id,
          require_email_verification as "requireEmailVerification",
          password_min_length as "passwordMinLength",
          require_number as "requireNumber",
          require_lowercase as "requireLowercase",
          require_uppercase as "requireUppercase",
          require_special_char as "requireSpecialChar",
          created_at as "createdAt",
          updated_at as "updatedAt"
         FROM _auth_configs
         LIMIT 1`
      );

      // If no config exists, create default and return it
      if (!result.rows.length) {
        logger.warn('No auth config found, creating default configuration');
        return await this.createDefaultConfig();
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get auth config', { error });
      throw new AppError(
        'Failed to get email authentication configuration',
        500,
        ERROR_CODES.INTERNAL_ERROR
      );
    } finally {
      client.release();
    }
  }

  /**
   * Create default authentication configuration
   * This should only be called if the config doesn't exist
   */
  private async createDefaultConfig(): Promise<EmailAuthConfigSchema> {
    const client = await this.getPool().connect();
    try {
      const result = await client.query(
        `INSERT INTO _auth_configs (
          require_email_verification,
          password_min_length,
          require_number,
          require_lowercase,
          require_uppercase,
          require_special_char
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          require_email_verification as "requireEmailVerification",
          password_min_length as "passwordMinLength",
          require_number as "requireNumber",
          require_lowercase as "requireLowercase",
          require_uppercase as "requireUppercase",
          require_special_char as "requireSpecialChar",
          created_at as "createdAt",
          updated_at as "updatedAt"`,
        [false, 6, false, false, false, false]
      );

      logger.info('Default auth config created');
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create default auth config', { error });
      throw new AppError(
        'Failed to create default authentication configuration',
        500,
        ERROR_CODES.INTERNAL_ERROR
      );
    } finally {
      client.release();
    }
  }

  /**
   * Update email authentication configuration
   * Updates the singleton configuration row
   */
  async updateEmailConfig(input: UpdateEmailAuthConfigRequest): Promise<EmailAuthConfigSchema> {
    const client = await this.getPool().connect();
    try {
      await client.query('BEGIN');

      // Ensure config exists
      const existingResult = await client.query('SELECT id FROM _auth_configs LIMIT 1');

      if (!existingResult.rows.length) {
        // Create default config if it doesn't exist
        await this.createDefaultConfig();
      }

      // Build update query
      const updates: string[] = [];
      const values: (string | number | boolean)[] = [];
      let paramCount = 1;

      if (input.requireEmailVerification !== undefined) {
        updates.push(`require_email_verification = $${paramCount++}`);
        values.push(input.requireEmailVerification);
      }

      if (input.passwordMinLength !== undefined) {
        updates.push(`password_min_length = $${paramCount++}`);
        values.push(input.passwordMinLength);
      }

      if (input.requireNumber !== undefined) {
        updates.push(`require_number = $${paramCount++}`);
        values.push(input.requireNumber);
      }

      if (input.requireLowercase !== undefined) {
        updates.push(`require_lowercase = $${paramCount++}`);
        values.push(input.requireLowercase);
      }

      if (input.requireUppercase !== undefined) {
        updates.push(`require_uppercase = $${paramCount++}`);
        values.push(input.requireUppercase);
      }

      if (input.requireSpecialChar !== undefined) {
        updates.push(`require_special_char = $${paramCount++}`);
        values.push(input.requireSpecialChar);
      }

      if (!updates.length) {
        await client.query('COMMIT');
        // Return current config if no updates
        return await this.getEmailConfig();
      }

      // Add updated_at to updates
      updates.push('updated_at = NOW()');

      const result = await client.query(
        `UPDATE _auth_configs
         SET ${updates.join(', ')}
         RETURNING
           id,
           require_email_verification as "requireEmailVerification",
           password_min_length as "passwordMinLength",
           require_number as "requireNumber",
           require_lowercase as "requireLowercase",
           require_uppercase as "requireUppercase",
           require_special_char as "requireSpecialChar",
           created_at as "createdAt",
           updated_at as "updatedAt"`,
        values
      );

      await client.query('COMMIT');
      logger.info('Auth config updated', { updatedFields: Object.keys(input) });
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to update auth config', { error });
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        'Failed to update email authentication configuration',
        500,
        ERROR_CODES.INTERNAL_ERROR
      );
    } finally {
      client.release();
    }
  }
}
