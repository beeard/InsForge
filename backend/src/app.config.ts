import dotenv from 'dotenv';
dotenv.config();

export interface AppConfig {
  app: {
    port: number;
    jwtSecret: string;
    apiKey: string;
    logLevel: string;
  };
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    databaseName: string;
  };
  cloud: {
    storageBucket: string;
    apiHost: string;
    projectId: string;
    appKey: string;
  };
}

export const config: AppConfig = {
  app: {
    port: parseInt(process.env.PORT || '3000', 10),
    jwtSecret: process.env.JWT_SECRET || 'your_jwt_secret',
    apiKey: process.env.ACCESS_API_KEY || 'your_api_key',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.POSTGRES_USERNAME || 'user',
    password: process.env.POSTGRES_PASSWORD || 'password',
    databaseName: process.env.POSTGRES_NAME || 'insforge',
  },
  cloud: {
    storageBucket: process.env.STORAGE_BUCKET || '',
    apiHost: process.env.CLOUD_API_HOST || 'https://api.insforge.dev',
    projectId: process.env.PROJECT_ID || 'local',
    appKey: process.env.APP_KEY || 'default-app-key',
  },
};
