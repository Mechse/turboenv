import { z, type ZodRawShape } from "zod";

type InitEnvOptions<
	TServer extends ZodRawShape,
	TClient extends ZodRawShape,
> = {
	server: TServer;
	client: TClient;
	runtimeEnv?: Record<string, unknown>;
};

export function initEnv<
	TServer extends ZodRawShape,
	TClient extends ZodRawShape,
>(opts: InitEnvOptions<TServer, TClient>) {
	const { server, client } = opts;

	const clientSchema = z.object(client);
	const serverSchema = z.object(server);
	const mergedSchema = clientSchema.merge(serverSchema);

	const isClient = typeof window !== "undefined";
	const rawEnv: Record<string, unknown> =
		opts.runtimeEnv ?? (isClient ? import.meta.env : process.env);

	// Validate VITE_ prefix on client
	for (const key of Object.keys(client)) {
		if (!key.startsWith("VITE_")) {
			throw new Error(
				`❌ Environment variable "${key}" must be prefixed with "VITE_"`,
			);
		}
	}

	const parsed = mergedSchema.parse(rawEnv);

	if (isClient) {
		// Block access to server-only env vars on client
		for (const key of Object.keys(server)) {
			Object.defineProperty(parsed, key, {
				get() {
					throw new Error(
						`❌ Attempted to access server-only env var "${key}" on the client`,
					);
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
