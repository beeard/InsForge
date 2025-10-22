import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '@/core/auth/auth.js';
import { OAuthConfigService } from '@/core/auth/oauth.js';
import { AuditService } from '@/core/logs/audit.js';
import { AppError } from '@/api/middleware/error.js';
import { ERROR_CODES } from '@/types/error-constants.js';
import { successResponse } from '@/utils/response.js';
import { AuthRequest, verifyAdmin } from '@/api/middleware/auth.js';
import logger from '@/utils/logger.js';
import jwt from 'jsonwebtoken';
import { SocketService } from '@/core/socket/socket.js';
import { DataUpdateResourceType, ServerEvents } from '@/core/socket/types.js';
import {
  createOAuthConfigRequestSchema,
  updateOAuthConfigRequestSchema,
  type ListOAuthConfigsResponse,
  oAuthProvidersSchema,
} from '@insforge/shared-schemas';
import { isOAuthSharedKeysAvailable } from '@/utils/environment.js';

const router = Router();
const authService = AuthService.getInstance();
const oauthConfigService = OAuthConfigService.getInstance();
const auditService = AuditService.getInstance();

// Helper function to validate JWT_SECRET
const validateJwtSecret = (): string => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.trim() === '') {
    throw new AppError(
      'JWT_SECRET environment variable is not configured. This is required for OAuth state protection.',
      500,
      ERROR_CODES.AUTH_OAUTH_CONFIG_ERROR
    );
  }
  return jwtSecret;
};

// Helper function to validate and normalize redirect origins
const validateRedirectOrigin = (redirectUri: string): string => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(redirectUri);
  } catch {
    throw new AppError('Invalid redirect URI format', 400, ERROR_CODES.INVALID_INPUT);
  }

  // Get allowed origins from environment
  const allowedOrigins =
    process.env.OAUTH_ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()) || [];

  if (allowedOrigins.length === 0) {
    throw new AppError(
      'OAuth redirect validation is not configured. OAUTH_ALLOWED_ORIGINS must be set.',
      500,
      ERROR_CODES.AUTH_OAUTH_CONFIG_ERROR
    );
  }

  const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;

  if (!allowedOrigins.includes(origin)) {
    logger.warn('OAuth redirect to disallowed origin blocked', {
      origin,
      allowedOrigins,
      redirectUri,
    });
    throw new AppError(
      `Redirect origin not allowed. Allowed origins: ${allowedOrigins.join(', ')}`,
      400,
      ERROR_CODES.INVALID_INPUT
    );
  }

  return origin;
};

// Helper function to set secure authentication cookies
type AuthResult = { accessToken?: string; user?: { id?: string; email?: string; name?: string } };

const setAuthCookies = (res: Response, result: AuthResult) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none' as const, // 'none' required for cross-origin OAuth flows with CORS credentials
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
  };

  if (result?.accessToken) {
    res.cookie('access_token', result.accessToken, cookieOptions);
  }
};

// Helper function to clear authentication cookies
const clearAuthCookies = (res: Response) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none' as const, // 'none' required for cross-origin OAuth flows with CORS credentials
    maxAge: 0,
    path: '/',
  };

  res.cookie('access_token', '', cookieOptions);
};

// OAuth Configuration Management Routes (must come before wildcard routes)
// GET /api/auth/oauth/configs - List all OAuth configurations (admin only)
router.get('/configs', verifyAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const configs = await oauthConfigService.getAllConfigs();
    const response: ListOAuthConfigsResponse = {
      data: configs,
      count: configs.length,
    };
    res.json(response);
  } catch (error) {
    logger.error('Failed to get OAuth configs', { error });
    next(error);
  }
});

// GET /api/auth/oauth/configs/:provider - Get specific OAuth configuration (admin only)
router.get(
  '/configs/:provider',
  verifyAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { provider } = req.params;
      const config = await oauthConfigService.getConfigByProvider(provider);
      const clientSecret = await oauthConfigService.getClientSecretByProvider(provider);

      if (!config) {
        throw new AppError(
          `OAuth configuration for ${provider} not found`,
          404,
          ERROR_CODES.NOT_FOUND
        );
      }

      res.json({
        ...config,
        clientSecret: clientSecret || undefined,
      });
    } catch (error) {
      logger.error('Failed to get OAuth config by provider', {
        provider: req.params.provider,
        error,
      });
      next(error);
    }
  }
);

// POST /api/auth/oauth/configs - Create new OAuth configuration (admin only)
router.post(
  '/configs',
  verifyAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const validationResult = createOAuthConfigRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        throw new AppError(
          validationResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
          400,
          ERROR_CODES.INVALID_INPUT
        );
      }

      const input = validationResult.data;

      // Check if using shared keys when not allowed
      if (input.useSharedKey && !isOAuthSharedKeysAvailable()) {
        throw new AppError(
          'Shared OAuth keys are not enabled in this environment',
          400,
          ERROR_CODES.AUTH_OAUTH_CONFIG_ERROR
        );
      }

      const config = await oauthConfigService.createConfig(input);

      await auditService.log({
        actor: req.user?.email || 'api-key',
        action: 'CREATE_OAUTH_CONFIG',
        module: 'AUTH',
        details: {
          provider: input.provider,
          useSharedKey: input.useSharedKey || false,
        },
        ip_address: req.ip,
      });

      // Broadcast configuration change
      const socket = SocketService.getInstance();
      socket.broadcastToRoom('role:project_admin', ServerEvents.DATA_UPDATE, {
        resource: DataUpdateResourceType.AUTH_SCHEMA,
      });

      successResponse(res, config);
    } catch (error) {
      logger.error('Failed to create OAuth configuration', { error });
      next(error);
    }
  }
);

// PUT /api/auth/oauth/configs/:provider - Update OAuth configuration (admin only)
router.put(
  '/configs/:provider',
  verifyAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const provider = req.params.provider;
      if (!provider || provider.length === 0 || provider.length > 50) {
        throw new AppError('Invalid provider name', 400, ERROR_CODES.INVALID_INPUT);
      }

      const validationResult = updateOAuthConfigRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        throw new AppError(
          validationResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
          400,
          ERROR_CODES.INVALID_INPUT
        );
      }

      const input = validationResult.data;

      // Check if using shared keys when not allowed
      if (input.useSharedKey && !isOAuthSharedKeysAvailable()) {
        throw new AppError(
          'Shared OAuth keys are not enabled in this environment',
          400,
          ERROR_CODES.AUTH_OAUTH_CONFIG_ERROR
        );
      }

      const config = await oauthConfigService.updateConfig(provider, input);

      await auditService.log({
        actor: req.user?.email || 'api-key',
        action: 'UPDATE_OAUTH_CONFIG',
        module: 'AUTH',
        details: {
          provider,
          updatedFields: Object.keys(input),
        },
        ip_address: req.ip,
      });

      // Broadcast configuration change
      const socket = SocketService.getInstance();
      socket.broadcastToRoom('role:project_admin', ServerEvents.DATA_UPDATE, {
        resource: DataUpdateResourceType.AUTH_SCHEMA,
      });

      successResponse(res, config);
    } catch (error) {
      logger.error('Failed to update OAuth configuration', {
        error,
        provider: req.params.provider,
      });
      next(error);
    }
  }
);

// DELETE /api/auth/oauth/configs/:provider - Delete OAuth configuration (admin only)
router.delete(
  '/configs/:provider',
  verifyAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const provider = req.params.provider;
      if (!provider || provider.length === 0 || provider.length > 50) {
        throw new AppError('Invalid provider name', 400, ERROR_CODES.INVALID_INPUT);
      }
      const deleted = await oauthConfigService.deleteConfig(provider);

      if (!deleted) {
        throw new AppError(
          `OAuth configuration for ${provider} not found`,
          404,
          ERROR_CODES.NOT_FOUND
        );
      }

      await auditService.log({
        actor: req.user?.email || 'api-key',
        action: 'DELETE_OAUTH_CONFIG',
        module: 'AUTH',
        details: { provider },
        ip_address: req.ip,
      });

      // Broadcast configuration change
      const socket = SocketService.getInstance();
      socket.broadcastToRoom('role:project_admin', ServerEvents.DATA_UPDATE, {
        resource: DataUpdateResourceType.AUTH_SCHEMA,
      });

      successResponse(res, {
        success: true,
        message: `OAuth configuration for ${provider} deleted successfully`,
      });
    } catch (error) {
      logger.error('Failed to delete OAuth configuration', {
        error,
        provider: req.params.provider,
      });
      next(error);
    }
  }
);

// OAuth Flow Routes
// GET /api/auth/oauth/:provider - Initialize OAuth flow for any supported provider
router.get('/:provider', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider } = req.params;
    const { redirect_uri } = req.query;

    // Validate provider using OAuthProvidersSchema
    const providerValidation = oAuthProvidersSchema.safeParse(provider);
    if (!providerValidation.success) {
      throw new AppError(
        `Unsupported OAuth provider: ${provider}. Supported providers: ${oAuthProvidersSchema.options.join(', ')}`,
        400,
        ERROR_CODES.INVALID_INPUT
      );
    }

    const validatedProvider = providerValidation.data;

    if (!redirect_uri) {
      throw new AppError('Redirect URI is required', 400, ERROR_CODES.INVALID_INPUT);
    }

    // Validate and normalize the redirect origin
    const validatedOrigin = validateRedirectOrigin(redirect_uri as string);

    const jwtPayload = {
      provider: validatedProvider,
      origin: validatedOrigin, // Store only the validated origin, not full URL
      createdAt: Date.now(),
    };
    const jwtSecret = validateJwtSecret();
    const state = jwt.sign(jwtPayload, jwtSecret, {
      algorithm: 'HS256',
      expiresIn: '1h', // Set expiration time for the state token
    });

    const authUrl = await authService.generateAuthUrl(validatedProvider, state);

    res.json({ authUrl });
  } catch (error) {
    logger.error(`${req.params.provider} OAuth error`, { error });

    // If it's already an AppError, pass it through
    if (error instanceof AppError) {
      next(error);
      return;
    }

    // For other errors, return the generic OAuth configuration error
    next(
      new AppError(
        `${req.params.provider} OAuth is not properly configured. Please check your oauth configurations.`,
        500,
        ERROR_CODES.AUTH_OAUTH_CONFIG_ERROR
      )
    );
  }
});

// GET /api/auth/oauth/shared/callback/:state - Shared callback for OAuth providers
router.get('/shared/callback/:state', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { state } = req.params;
    const { success, error, payload } = req.query;

    if (!state) {
      logger.warn('Shared OAuth callback called without state parameter');
      throw new AppError('State parameter is required', 400, ERROR_CODES.INVALID_INPUT);
    }

    let origin: string;
    let provider: string;
    try {
      const jwtSecret = validateJwtSecret();
      const decodedState = jwt.verify(state, jwtSecret) as {
        provider: string;
        origin: string;
      };
      origin = decodedState.origin || '';
      provider = decodedState.provider || '';
    } catch {
      logger.warn('Invalid state parameter', { state });
      throw new AppError('Invalid state parameter', 400, ERROR_CODES.INVALID_INPUT);
    }

    // Validate provider using OAuthProvidersSchema
    const providerValidation = oAuthProvidersSchema.safeParse(provider);
    if (!providerValidation.success) {
      logger.warn('Invalid provider in state', { provider });
      throw new AppError(
        `Invalid provider in state: ${provider}. Supported providers: ${oAuthProvidersSchema.options.join(', ')}`,
        400,
        ERROR_CODES.INVALID_INPUT
      );
    }
    const validatedProvider = providerValidation.data;
    if (!origin) {
      throw new AppError('Origin is required', 400, ERROR_CODES.INVALID_INPUT);
    }

    if (success !== 'true') {
      const errorMessage = error || 'OAuth authentication failed';
      logger.warn('Shared OAuth callback failed', { error: errorMessage, provider });
      clearAuthCookies(res);
      return res.redirect(`${origin}/?error=${encodeURIComponent(String(errorMessage))}`);
    }
    if (!payload) {
      throw new AppError('No payload provided in callback', 400, ERROR_CODES.INVALID_INPUT);
    }

    try {
      const payloadData = JSON.parse(Buffer.from(payload as string, 'base64').toString('utf8'));
      const result = await authService.handleOAuthCallback(validatedProvider, payloadData);

      // Set secure cookies instead of URL parameters
      setAuthCookies(res, result);

      // Redirect to the validated origin without sensitive data in URL
      res.redirect(`${origin}/?success=true`);
    } catch (error) {
      logger.error('OAuth callback processing failed', { error, provider });
      clearAuthCookies(res);
      res.redirect(`${origin}/?error=${encodeURIComponent('Authentication failed')}`);
    }
  } catch (error) {
    logger.error('Shared OAuth callback error', { error });
    next(error);
  }
});

// GET /api/auth/oauth/:provider/callback - OAuth provider callback
router.get('/:provider/callback', async (req: Request, res: Response, _: NextFunction) => {
  try {
    const { provider } = req.params;
    const { code, state, token } = req.query;

    let origin = process.env.DEFAULT_FRONTEND_ORIGIN || 'http://localhost:3000';

    if (state) {
      try {
        const jwtSecret = validateJwtSecret();
        const stateData = jwt.verify(state as string, jwtSecret) as {
          provider: string;
          origin: string;
        };
        origin = stateData.origin || origin;
      } catch {
        // Invalid state, use default origin
        logger.warn('Invalid state in provider callback, using default origin', { state });
      }
    }

    // Validate provider using OAuthProvidersSchema
    const providerValidation = oAuthProvidersSchema.safeParse(provider);
    if (!providerValidation.success) {
      throw new AppError(
        `Unsupported OAuth provider: ${provider}. Supported providers: ${oAuthProvidersSchema.options.join(', ')}`,
        400,
        ERROR_CODES.INVALID_INPUT
      );
    }

    const validatedProvider = providerValidation.data;

    try {
      const result = await authService.handleOAuthCallback(validatedProvider, {
        code: code as string | undefined,
        token: token as string | undefined,
      });

      // Set secure cookies instead of URL parameters
      setAuthCookies(res, result);

      logger.info('OAuth callback successful, redirecting with secure cookies', {
        origin,
        hasAccessToken: !!result?.accessToken,
        hasUserId: !!result?.user?.id,
        provider: validatedProvider,
      });

      // Redirect to the validated origin without sensitive data in URL
      return res.redirect(`${origin}/?success=true`);
    } catch (error) {
      logger.error('OAuth callback processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: validatedProvider,
        origin,
      });
      clearAuthCookies(res);
      return res.redirect(`${origin}/?error=${encodeURIComponent('Authentication failed')}`);
    }
  } catch (error) {
    logger.error('OAuth callback error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      provider: req.params.provider,
      hasCode: !!req.query.code,
      hasState: !!req.query.state,
      hasToken: !!req.query.token,
    });

    // Clear any authentication cookies on error
    clearAuthCookies(res);

    // Get origin from state or use default
    let origin = process.env.DEFAULT_FRONTEND_ORIGIN || 'http://localhost:3000';
    const { state } = req.query;

    if (state) {
      try {
        const jwtSecret = validateJwtSecret();
        const stateData = jwt.verify(state as string, jwtSecret) as {
          origin: string;
        };
        origin = stateData.origin || origin;
      } catch {
        // Invalid state, use default origin
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'OAuth authentication failed';

    // Redirect to validated origin with error message
    return res.redirect(`${origin}/?error=${encodeURIComponent(errorMessage)}`);
  }
});

export default router;
