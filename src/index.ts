import { z, type ZodRawShape, type ZodObject, type ZodTypeAny } from "zod";

type EnvShape = {
	server: ZodRawShape;
	client: ZodRawShape;
	runtimeEnv: Record<string, unknown>;
};

type ValidateEnv<T extends EnvShape> = {
	clientSchema: ZodObject<T["client"]>;
	serverSchema: ZodObject<T["server"]>;
	combinedSchema: ZodObject<T["client"] & T["server"]>;
	runtimeEnv: T["runtimeEnv"];
	clientEnv: Record<keyof T["client"], string>;
	serverEnv: Record<keyof T["server"], string>;
};

export function initEnv<T extends EnvShape>(opts: T): ValidateEnv<T> {
	const clientSchema = z.object(opts.client);
	const serverSchema = z.object(opts.server);

	const combinedSchema = clientSchema.merge(serverSchema);

	const parsed = combinedSchema.parse(opts.runtimeEnv);

	// Validate VITE_ prefix
	for (const key of Object.keys(opts.client)) {
		if (!key.startsWith("VITE_")) {
			throw new Error(
				`❌ Invalid client environment variable "${key}". It must be prefixed with "VITE_".`,
			);
		}
	}

	// Throw if accessing server vars on the client
	if (typeof window !== "undefined") {
		for (const key of Object.keys(opts.server)) {
			Object.defineProperty(parsed, key, {
				get() {
					throw new Error(
						`❌ Attempted to access server env var "${key}" on the client`,
					);
				},
			});
		}
	}

	return {
		clientSchema,
		serverSchema,
		combinedSchema,
		runtimeEnv: parsed,
		clientEnv: parsed as Record<keyof T["client"], string>,
		serverEnv: parsed as Record<keyof T["server"], string>,
	};
}

