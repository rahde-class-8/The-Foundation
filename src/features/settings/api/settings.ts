import { z } from 'zod';
import { supabase } from '@/lib/supabase';

export const SettingsSchema = z.object({
  timezone: z.string(),
  aiGradingEnabled: z.boolean(),
  defaultEvalMode: z.enum(['ai_first', 'self_only']),
  dailyNewLimit: z.number().int().min(0).max(100),
  dailyReviewLimit: z.number().int().min(1).max(1000),
  activeCertificationId: z.uuid().nullable(),
});
export type Settings = z.infer<typeof SettingsSchema>;

/** Loads settings, creating the defaults on first use. */
export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabase.rpc('get_settings');
  if (error) throw new Error(`Could not load settings: ${error.message}`);
  return SettingsSchema.parse(data);
}

export async function updateSettings(
  settings: Omit<Settings, 'activeCertificationId'>,
): Promise<Settings> {
  const { data, error } = await supabase.rpc('update_settings', {
    timezone: settings.timezone,
    ai_grading_enabled: settings.aiGradingEnabled,
    default_eval_mode: settings.defaultEvalMode,
    daily_new_limit: settings.dailyNewLimit,
    daily_review_limit: settings.dailyReviewLimit,
  });
  if (error) throw new Error(`Could not save settings: ${error.message}`);
  return SettingsSchema.parse(data);
}
