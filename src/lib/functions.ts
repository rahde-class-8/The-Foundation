import { FunctionsHttpError } from '@supabase/supabase-js';
import type { z } from 'zod';
import { ApiErrorSchema } from '@core/contracts/practice.ts';
import { supabase } from './supabase';

/** Calls an Edge Function and validates its response; failures surface the server's safe message. */
export async function invokeFunction<S extends z.ZodType>(
  name: string,
  body: unknown,
  schema: S,
): Promise<z.infer<S>> {
  const { data, error } = await supabase.functions.invoke(name, {
    body: body as Record<string, unknown>,
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = ApiErrorSchema.safeParse(
        await (error.context as Response).json().catch(() => null),
      );
      if (payload.success) throw new Error(payload.data.error.message);
    }
    throw new Error(`The ${name} service is unavailable. ${error.message}`);
  }
  return schema.parse(data);
}
