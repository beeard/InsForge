import { createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose';
import { AppError } from '@/api/middleware/error';
import { ERROR_CODES, NEXT_ACTION } from '@/types/error-constants';

// Cache the JWKS instance to avoid repeated fetches
let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrl: string | null = null;

/**
 * Get or create cached JWKS instance
 */
function getJWKS() {
  const cloudApiHost = process.env.CLOUD_API_HOST || 'https://api.insforge.dev';
  const currentUrl = `${cloudApiHost}/.well-known/jwks.json`;

  // Return cached instance if URL hasn't changed
  if (cachedJWKS && jwksUrl === currentUrl) {
    return cachedJWKS;
  }

  // Create new JWKS instance with timeout and cache settings
  jwksUrl = currentUrl;
  cachedJWKS = createRemoteJWKSet(new URL(currentUrl), {
    timeoutDuration: 10000, // 10 second timeout
    cooldownDuration: 30000, // 30 seconds between refetches
    cacheMaxAge: 600000, // Cache for 10 minutes
  });

  return cachedJWKS;
}

/**
 * Helper function to verify cloud backend JWT token
 * Validates JWT tokens from api.insforge.dev using JWKS
 */
export async function verifyCloudToken(
  token: string
): Promise<{ projectId: string; payload: JWTPayload }> {
  try {
    const JWKS = getJWKS();

    // Verify the token with jose
    const { payload } = await jwtVerify(token, JWKS, {
      algorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'],
    });

    // Verify project_id matches if configured
    const tokenProjectId = payload['projectId'] as string;
    const expectedProjectId = process.env.PROJECT_ID;

    if (expectedProjectId && tokenProjectId !== expectedProjectId) {
      throw new AppError(
        'Project ID mismatch',
        403,
        ERROR_CODES.AUTH_UNAUTHORIZED,
        NEXT_ACTION.CHECK_TOKEN
      );
    }

    return {
      projectId: tokenProjectId || expectedProjectId || 'local',
      payload,
    };
  } catch (error) {
    // Re-throw AppError as-is
    if (error instanceof AppError) {
      throw error;
    }

    // Wrap other JWT errors
    throw new AppError(
      `Invalid admin credentials: ${error instanceof Error ? error.message : 'Unknown error'}`,
      401,
      ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      NEXT_ACTION.CHECK_TOKEN
    );
  }
}
