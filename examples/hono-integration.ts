import { Hono } from 'hono';
import { z } from 'zod';
import { initEnv, type CreateHonoBindings, type ExtractServerEnv } from '../src/index';

// Define your environment schema
const envSchema = {
  server: {
    DATABASE_URL: z.string().url(),
    API_SECRET: z.string().min(1),
    PORT: z.string().default('3000').transform(Number),
  },
  client: {
    VITE_APP_NAME: z.string(),
    VITE_API_URL: z.string().url(),
  }
};

// Initialize environment with error handling
const env = initEnv({
  ...envSchema,
  strict: false, // Don't throw immediately on missing vars
  onError: (error) => {
    console.error(`[turboenv] ${error.message}`);
    // Could send to logging service, etc.
  }
});

// Create Hono app with proper typing
type AppBindings = CreateHonoBindings<typeof envSchema.server>;

const app = new Hono<{ Bindings: AppBindings['Bindings'] }>();

app.get('/', (c) => {
  // Now c.env has full autocompletion for all server env vars!
  const dbUrl = c.env.DATABASE_URL; // ✅ Autocompletion works
  const apiSecret = c.env.API_SECRET; // ✅ Autocompletion works
  const port = c.env.PORT; // ✅ Autocompletion works

  return c.json({
    message: 'Server running',
    database: dbUrl,
    port: port
  });
});

// Alternative approach using ExtractServerEnv helper
type ServerEnv = ExtractServerEnv<typeof env>;
const app2 = new Hono<{ Bindings: z.infer<z.ZodObject<ServerEnv>> }>();

export default app;
