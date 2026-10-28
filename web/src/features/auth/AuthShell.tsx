import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

const AuthShell = ({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) => (
  <div className="flex min-h-svh items-center justify-center bg-background p-4">
    <Card className="w-full max-w-sm"><CardContent className="space-y-6 p-6">
      <div className="space-y-1"><div className="text-lg font-extrabold tracking-wide">⚓ Bosun</div><h1 className="text-2xl font-bold">{title}</h1>{subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}</div>
      {children}
    </CardContent></Card>
  </div>
);
export default AuthShell;
