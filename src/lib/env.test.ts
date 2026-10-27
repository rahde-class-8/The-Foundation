import { parseEnv } from './env';

describe('parseEnv', () => {
  it('accepts a complete configuration', () => {
    expect(
      parseEnv({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'key' }),
    ).toEqual({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'key' });
  });

  it('names every invalid variable', () => {
    expect(() => parseEnv({ VITE_SUPABASE_URL: 'not-a-url' })).toThrow(
      /VITE_SUPABASE_URL[\s\S]*VITE_SUPABASE_ANON_KEY/,
    );
  });
});
