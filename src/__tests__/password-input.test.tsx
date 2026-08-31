// ================================================================
// TESTS — src/components/ui/PasswordInput.tsx
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordInput } from '@/components/ui/PasswordInput';

beforeEach(() => cleanup());

function montar(value = '') {
  return render(<PasswordInput id="pw" value={value} onChange={() => {}} placeholder="Contraseña" />);
}

describe('PasswordInput', () => {
  it('oculta la contraseña por defecto', () => {
    montar();
    expect(screen.getByPlaceholderText('Contraseña')).toHaveAttribute('type', 'password');
  });

  it('el botón revela la contraseña al pulsarlo, y vuelve a ocultarla', async () => {
    const user = userEvent.setup();
    montar();

    const boton = screen.getByRole('button', { name: 'Mostrar contraseña' });
    await user.click(boton);
    expect(screen.getByPlaceholderText('Contraseña')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(screen.getByPlaceholderText('Contraseña')).toHaveAttribute('type', 'password');
  });

  it('escribir en el campo llama a onChange con el valor tecleado', async () => {
    const user = userEvent.setup();
    let recibido = '';
    render(<PasswordInput id="pw" value="" onChange={(v) => { recibido = v; }} placeholder="Contraseña" />);
    await user.type(screen.getByPlaceholderText('Contraseña'), 'a');
    expect(recibido).toBe('a');
  });
});
