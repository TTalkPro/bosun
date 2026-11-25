import { describe, expect, it } from 'vitest';
import { passwordStrength } from '@/features/auth/passwordStrength';

describe('password strength hint', () => {
  it('is 0 below the server minimum of 8', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('Ab1!xyz')).toBe(0);
  });

  it('grows with length and character variety, capped at 4', () => {
    expect(passwordStrength('abcdefgh')).toBe(1);
    expect(passwordStrength('abcdefgh1')).toBe(2);
    expect(passwordStrength('abcdEFGH1')).toBe(3);
    expect(passwordStrength('abcdEFGH1!longer')).toBe(4);
    expect(passwordStrength('aaaaaaaaaaaa')).toBe(2);
  });
});
