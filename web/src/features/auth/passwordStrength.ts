// 密码强度提示（只是提示，不拦提交）：服务端规则只有「至少 8 位」，这里在它之上给个参考。
export type Strength = 0 | 1 | 2 | 3 | 4;

export const STRENGTH_LABEL: Record<Strength, string> = { 0: '太短', 1: '弱', 2: '一般', 3: '较强', 4: '强' };

export const passwordStrength = (pw: string): Strength => {
  if (pw.length < 8) return 0;
  let score = 1;
  if (pw.length >= 12) score += 1;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  if (kinds >= 2) score += 1;
  if (kinds >= 3) score += 1;
  return Math.min(4, score) as Strength;
};
