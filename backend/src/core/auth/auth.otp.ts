import { Pool, PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import { DatabaseManager } from '@/core/database/manager.js';
import { AppError } from '@/api/middleware/error.js';
import { ERROR_CODES } from '@/types/error-constants.js';
import logger from '@/utils/logger.js';
import { generateNumericCode } from '@/utils/utils.js';

/**
 * OTP purpose types - used to categorize different OTP use cases
 */
export enum EmailOTPPurpose {
  VERIFY_EMAIL = 'VERIFY_EMAIL',
  RESET_PASSWORD = 'RESET_PASSWORD',
}

/**
 * Result of OTP creation
 */
export interface CreateOTPResult {
  success: boolean;
  code: string;
  expiresAt: Date;
}

/**
 * Result of OTP verification
 */
export interface VerifyOTPResult {
  success: boolean;
  email: string;
  purpose: string;
}

/**
 * Service for managing email-based one-time passwords (OTPs)
 * Handles creation, verification, and cleanup of OTP codes
 */
export class AuthOTPService {
  private static instance: AuthOTPService;
  private pool: Pool | null = null;

  // Configuration constants
  private readonly OTP_CODE_LENGTH = 6;
  private readonly OTP_EXPIRY_MINUTES = 60; // 60 minutes expiry
  private readonly MAX_ATTEMPTS = 5; // Maximum verification attempts
  private readonly BCRYPT_SALT_ROUNDS = 10; // Recommended salt rounds for security (2^10 iterations)

  private constructor() {
    logger.info('AuthOTPService initialized');
  }

  public static getInstance(): AuthOTPService {
    if (!AuthOTPService.instance) {
      AuthOTPService.instance = new AuthOTPService();
    }
    return AuthOTPService.instance;
  }

  private getPool(): Pool {
    if (!this.pool) {
      this.pool = DatabaseManager.getInstance().getPool();
    }
    return this.pool;
  }

  /**
   * Create or update an email OTP for the given email and purpose
   * Uses upsert to ensure only one active OTP exists per email/purpose combination
   *
   * @param email - The email address for the OTP
   * @param purpose - The purpose of the OTP (e.g., 'email_verification', 'password_reset')
   * @returns Promise with creation result including the code and expiry time
   */
  async createEmailOTP(email: string, purpose: EmailOTPPurpose): Promise<CreateOTPResult> {
    const client = await this.getPool().connect();
    try {
      // Generate random numeric code
      const code = generateNumericCode(this.OTP_CODE_LENGTH);

      // Hash the code for secure storage
      const codeHash = await bcrypt.hash(code, this.BCRYPT_SALT_ROUNDS);

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

      // Upsert OTP record - insert or update if email+purpose combination already exists
      // This ensures only one active OTP per email/purpose
      await client.query(
        `INSERT INTO _email_otps (email, purpose, code_hash, expires_at, consumed_at, attempts_count)
         VALUES ($1, $2, $3, $4, NULL, 0)
         ON CONFLICT (email, purpose)
         DO UPDATE SET
           code_hash = EXCLUDED.code_hash,
           expires_at = EXCLUDED.expires_at,
           consumed_at = NULL,
           attempts_count = 0,
           updated_at = NOW()`,
        [email, purpose, codeHash, expiresAt]
      );

      logger.info('Email OTP created successfully', {
        email,
        purpose,
        expiresAt: expiresAt.toISOString(),
      });

      return {
        success: true,
        code,
        expiresAt,
      };
    } catch (error) {
      logger.error('Failed to create email OTP', { error, email, purpose });
      throw new AppError('Failed to create verification code', 500, ERROR_CODES.INTERNAL_ERROR);
    } finally {
      client.release();
    }
  }

  /**
   * Verify an email OTP code
   * Checks if the code is valid, not expired, not consumed, and within attempt limits
   * Uses constant-time error messages to prevent information leakage
   *
   * @param email - The email address associated with the OTP
   * @param purpose - The purpose of the OTP
   * @param code - The code to verify
   * @param externalClient - Optional external database client for transaction support
   * @returns Promise with verification result
   * @throws AppError if verification fails (with generic error message)
   */
  async verifyEmailOTP(
    email: string,
    purpose: EmailOTPPurpose,
    code: string,
    externalClient?: PoolClient
  ): Promise<VerifyOTPResult> {
    const client = externalClient || (await this.getPool().connect());
    const shouldManageTransaction = !externalClient;

    try {
      if (shouldManageTransaction) {
        await client.query('BEGIN');
      }

      // Fetch the OTP record
      const result = await client.query(
        `SELECT id, email, purpose, code_hash, expires_at, consumed_at, attempts_count
         FROM _email_otps
         WHERE email = $1 AND purpose = $2`,
        [email, purpose]
      );

      // Check if OTP record exists and is valid
      if (
        result.rows.length === 0 ||
        result.rows[0].attempts_count >= this.MAX_ATTEMPTS ||
        new Date() > new Date(result.rows[0].expires_at) ||
        result.rows[0].consumed_at !== null
      ) {
        throw new AppError('Invalid or expired verification code', 400, ERROR_CODES.INVALID_INPUT);
      }

      const otpRecord = result.rows[0];

      // Verify the code hash
      const isValid = await bcrypt.compare(code, otpRecord.code_hash);

      if (!isValid) {
        // Increment attempt count on failed verification
        await client.query(
          `UPDATE _email_otps
           SET attempts_count = attempts_count + 1, updated_at = NOW()
           WHERE id = $1`,
          [otpRecord.id]
        );

        if (shouldManageTransaction) {
          await client.query('COMMIT');
        }
        throw new AppError('Invalid or expired verification code', 400, ERROR_CODES.INVALID_INPUT);
      }

      // Mark OTP as consumed
      await client.query(
        `UPDATE _email_otps
         SET consumed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [otpRecord.id]
      );

      if (shouldManageTransaction) {
        await client.query('COMMIT');
      }

      logger.info('Email OTP verified successfully', { email, purpose });

      return {
        success: true,
        email: otpRecord.email,
        purpose: otpRecord.purpose,
      };
    } catch (error) {
      if (shouldManageTransaction) {
        await client.query('ROLLBACK');
      }

      if (error instanceof AppError) {
        throw error;
      }

      logger.error('Failed to verify email OTP', { error, email, purpose });
      throw new AppError('Failed to verify code', 500, ERROR_CODES.INTERNAL_ERROR);
    } finally {
      if (shouldManageTransaction) {
        client.release();
      }
    }
  }
}
