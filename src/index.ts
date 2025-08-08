import { z, type ZodRawShape, ZodError } from "zod";

type InitEnvOptions<
  TServer extends ZodRawShape,
  TClient extends ZodRawShape,
> = {
  server: TServer;
  client: TClient;
  runtimeEnv?: Record<string, unknown>;
  /**
   * Whether to throw on missing environment variables.
   * If false, will return undefined for missing optional variables.
   * @default true
   */
  strict?: boolean;
  /**
   * Custom error handler for missing/invalid environment variables
   */
  onError?: (error: EnvError) => void;
};

export class EnvError extends Error {
  constructor(
    public readonly type: "missing" | "invalid" | "client_access",
    public readonly variable: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "EnvError";
  }
}

export function initEnv<
  TServer extends ZodRawShape,
  TClient extends ZodRawShape,
>(opts: InitEnvOptions<TServer, TClient>) {
  const { server, client, strict = true, onError } = opts;

  const clientSchema = z.object(client);
  const serverSchema = z.object(server);
  const mergedSchema = clientSchema.merge(serverSchema);

  const isClient = typeof window !== "undefined";

  // Get default environment sources
  const getDefaultEnv = (): Record<string, unknown> => {
    if (isClient) {
      // On client, we'll rely on the bundler to provide import.meta.env
      // If import.meta.env is not available, bundlers typically replace it with {}
      try {
        // This will be replaced by bundlers like Vite with the actual env object
        return (import.meta as any)?.env || {};
      } catch {
        // Fallback for environments where import.meta is not available
        return {};
      }
    } else {
      // On server, use process.env
      return process.env;
    }
  };

  // Build runtime environment by merging defaults with provided runtimeEnv
  const buildRuntimeEnv = (): Record<string, unknown> => {
    const defaultEnv = getDefaultEnv();

    if (!opts.runtimeEnv) {
      return defaultEnv;
    }

    // If runtimeEnv is provided, merge it with defaults
    // runtimeEnv takes precedence over defaults
    const merged = { ...defaultEnv };

    // Only merge the keys that are relevant to this environment
    const relevantKeys = isClient
      ? Object.keys(client)
      : [...Object.keys(client), ...Object.keys(server)];

    for (const key of relevantKeys) {
      if (key in opts.runtimeEnv) {
        merged[key] = opts.runtimeEnv[key];
      }
    }

    return merged;
  };

  const rawEnv = buildRuntimeEnv();

  // Validate VITE_ prefix on client
  for (const key of Object.keys(client)) {
    if (!key.startsWith("VITE_")) {
      const error = new EnvError(
        "invalid",
        key,
        `❌ Client environment variable "${key}" must be prefixed with "VITE_"`,
      );
      if (onError) {
        onError(error);
        continue;
      }
      throw error;
    }
  }

  // Enhanced error handling for parsing
  let parsed: Record<string, unknown>;
  try {
    if (strict) {
      parsed = mergedSchema.parse(rawEnv);
    } else {
      // Use safeParse for non-strict mode
      const result = mergedSchema.safeParse(rawEnv);
      if (result.success) {
        parsed = result.data;
      } else {
        parsed = {};
        // Handle missing variables gracefully
        for (const [key, schemaValue] of Object.entries({
          ...server,
          ...client,
        })) {
          if (rawEnv[key] !== undefined) {
            try {
              // In Zod v4, we need to handle the schema differently
              const zodSchema = schemaValue as z.ZodType<any, any, any>;
              parsed[key] = zodSchema.parse(rawEnv[key]);
            } catch (error) {
              const envError = new EnvError(
                "invalid",
                key,
                `❌ Invalid value for environment variable "${key}"`,
                error,
              );
              if (onError) {
                onError(envError);
              } else {
                console.warn(envError.message);
              }
            }
          } else {
            // Variable is missing
            const envError = new EnvError(
              "missing",
              key,
              `❌ Missing environment variable "${key}"`,
            );
            if (onError) {
              onError(envError);
            } else {
              console.warn(envError.message);
            }
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof ZodError) {
      // Handle Zod v4 error structure
      const issues = error.issues || [];
      const missingVars: string[] = [];
      const invalidVars: string[] = [];

      for (const issue of issues) {
        const path = issue.path?.join(".") || "unknown";
        // In Zod v4, check for invalid_type issues more carefully
        if (issue.code === "invalid_type") {
          // Type assertion for Zod v4 issue structure
          const invalidTypeIssue = issue as any;
          if (
            invalidTypeIssue.received === "undefined" ||
            invalidTypeIssue.received === undefined
          ) {
            missingVars.push(path);
          } else {
            invalidVars.push(
              `${path}: expected ${invalidTypeIssue.expected}, received ${invalidTypeIssue.received}`,
            );
          }
        } else {
          invalidVars.push(`${path}: ${issue.message}`);
        }
      }

      let message = "❌ Environment validation failed:\n";
      if (missingVars.length > 0) {
        message += `Missing variables: ${missingVars.join(", ")}\n`;
      }
      if (invalidVars.length > 0) {
        message += `Invalid variables: ${invalidVars.join(", ")}\n`;
      }

      const envError = new EnvError("invalid", "", message, error);
      if (onError) {
        onError(envError);
        parsed = {};
      } else {
        throw envError;
      }
    } else {
      throw error;
    }
  }

  if (isClient) {
    // Block access to server-only env vars on client
    for (const key of Object.keys(server)) {
      Object.defineProperty(parsed, key, {
        get() {
          const error = new EnvError(
            "client_access",
            key,
            `❌ Attempted to access server-only env var "${key}" on the client`,
          );
          if (onError) {
            onError(error);
            return undefined;
          }
          throw error;
        },
      });
    }
  }

  return {
    ...parsed,
    client: parsed as z.infer<z.ZodObject<TClient>>,
    server: isClient ? undefined : (parsed as z.infer<z.ZodObject<TServer>>),
  };
}

/**
 * Creates Hono Bindings type from turboenv server schema
 * Use this to get autocompletion for c.env in Hono applications
 */
export type CreateHonoBindings<TServer extends ZodRawShape> = {
  Bindings: z.infer<z.ZodObject<TServer>>;
};

/**
 * Utility to extract server env types for Hono integration
 */
export type ExtractServerEnv<T> = T extends { server: infer S } ? S : never;
