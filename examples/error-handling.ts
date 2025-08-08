import { z } from 'zod';
import { initEnv, EnvError } from '../src/index';

// Example with comprehensive error handling
const env = initEnv({
  server: {
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url().optional(), // Optional variable
    API_KEY: z.string().min(10),
  },
  client: {
    VITE_APP_NAME: z.string().default('My App'), // With default
    VITE_DEBUG: z.string().transform(val => val === 'true').optional(),
  },
  strict: false,
  onError: (error: EnvError) => {
    switch (error.type) {
      case 'missing':
        console.warn(`⚠️  Missing env var: ${error.variable}`);
        // Could set defaults, prompt user, etc.
        break;
      case 'invalid':
        console.error(`❌ Invalid env var: ${error.variable} - ${error.message}`);
        // Could sanitize, transform, etc.
        break;
      case 'client_access':
        console.error(`🚫 Client access violation: ${error.message}`);
        // Could log security incident
        break;
    }
  }
});

// Usage with graceful degradation
if (env.server?.DATABASE_URL) {
  console.log('Database connection available');
} else {
  console.log('Database connection not configured');
}

export { env };
