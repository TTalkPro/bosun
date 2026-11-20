import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import CreatedKeyDialog from '@/features/account/CreatedKeyDialog';
import { renderApp } from './render';
import '@testing-library/jest-dom/vitest';

const key = {
  id: 'k1',
  user_id: 'u1',
  name: 'laptop',
  prefix: 'bsk_ab12cd',
  scopes: ['read'],
  project_keys: null,
  expires_at: null,
  created_at: '',
  rotated_at: '',
  last_used_at: null,
  revoked_at: null,
  status: 'active' as const,
  key: 'bsk_secret',
};

describe('CreatedKeyDialog', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('shows the secret once and copies it', async () => {
    const onClose = vi.fn();
    renderApp(<CreatedKeyDialog apiKey={key} title="Key 已轮换" onClose={onClose} />);
    expect(screen.getByTestId('new-key')).toHaveTextContent('bsk_secret');
    fireEvent.click(screen.getByRole('button', { name: '复制' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('bsk_secret'));
    fireEvent.click(screen.getByRole('button', { name: '我已保存，关闭' }));
    expect(onClose).toHaveBeenCalled();
  });
});
