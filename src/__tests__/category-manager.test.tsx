// ================================================================
// TESTS — CategoryManager
// La sección de categorías que vivía dentro de ProfilePage. Tiene CRUD
// completo y era la parte de Perfil sin ninguna prueba.
// ================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryManager } from '@/components/features/categories/CategoryManager';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';

const saveData = () => Promise.resolve(true);

function montar(abierto = true) {
  return render(<CategoryManager abierto={abierto} onToggle={() => {}} saveData={saveData} />);
}

beforeEach(() => {
  cleanup();
  useFinanceStore.setState({
    expenses: [],
    customExpenseCategories: [],
    customIncomeCategories: [],
    tombstones: {},
  });
  useUiStore.setState({ toasts: [] });
});

describe('CategoryManager — alta', () => {
  it('crea una categoría de gasto con id derivado del nombre', async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText('Nombre de la nueva categoría'), 'Insumos');
    await user.click(screen.getByRole('button', { name: /Añadir categoría/ }));

    const [cat] = useFinanceStore.getState().customExpenseCategories;
    expect(cat).toMatchObject({ label: 'Insumos' });
    expect(cat.id).toMatch(/^custom_/);
    expect(cat.updated_at).toBeTruthy();
  });

  it('rechaza un nombre vacío', async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole('button', { name: /Añadir categoría/ }));

    expect(useFinanceStore.getState().customExpenseCategories).toHaveLength(0);
    expect(useUiStore.getState().toasts[0]).toMatchObject({ type: 'error' });
  });

  it('rechaza un nombre repetido sin distinguir mayúsculas', async () => {
    const user = userEvent.setup();
    useFinanceStore.setState({
      customExpenseCategories: [
        { id: 'custom_insumos', label: 'Insumos', icon: '📦', color: 'bg-slate-100' },
      ],
    });
    montar();

    await user.type(screen.getByLabelText('Nombre de la nueva categoría'), 'INSUMOS');
    await user.click(screen.getByRole('button', { name: /Añadir categoría/ }));

    expect(useFinanceStore.getState().customExpenseCategories).toHaveLength(1);
    expect(useUiStore.getState().toasts[0]).toMatchObject({
      type: 'error',
      message: 'Ya existe una categoría con ese nombre',
    });
  });

  it('dos nombres distintos no colisionan de id', async () => {
    const user = userEvent.setup();
    montar();

    for (const nombre of ['Café', 'Cafe']) {
      await user.clear(screen.getByLabelText('Nombre de la nueva categoría'));
      await user.type(screen.getByLabelText('Nombre de la nueva categoría'), nombre);
      await user.click(screen.getByRole('button', { name: /Añadir categoría/ }));
    }

    const cats = useFinanceStore.getState().customExpenseCategories;
    expect(cats).toHaveLength(2);
    // El slugify antiguo colapsaba los acentos y las dos compartían id
    expect(cats[0].id).not.toBe(cats[1].id);
  });
});

describe('CategoryManager — edición', () => {
  beforeEach(() => {
    useFinanceStore.setState({
      customExpenseCategories: [
        { id: 'custom_insumos', label: 'Insumos', icon: '📦', color: 'bg-slate-100' },
      ],
    });
  });

  it('renombra sin cambiar el id, que es lo que ata los movimientos', async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole('button', { name: /Editar/ }));
    const campo = screen.getByLabelText('Nombre de la categoría');
    await user.clear(campo);
    await user.type(campo, 'Insumos y materiales');
    await user.click(screen.getByRole('button', { name: 'Guardar categoría' }));

    const [cat] = useFinanceStore.getState().customExpenseCategories;
    expect(cat.label).toBe('Insumos y materiales');
    expect(cat.id).toBe('custom_insumos');
  });

  it('cancelar deja la categoría como estaba', async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole('button', { name: /Editar/ }));
    const campo = screen.getByLabelText('Nombre de la categoría');
    await user.clear(campo);
    await user.type(campo, 'Otro nombre');
    await user.click(screen.getByRole('button', { name: 'Cancelar edición de categoría' }));

    expect(useFinanceStore.getState().customExpenseCategories[0].label).toBe('Insumos');
  });
});

describe('CategoryManager — borrado', () => {
  beforeEach(() => {
    useFinanceStore.setState({
      customExpenseCategories: [
        { id: 'custom_insumos', label: 'Insumos', icon: '📦', color: 'bg-slate-100' },
      ],
    });
  });

  it('pide confirmación antes de borrar', async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole('button', { name: /Eliminar/ }));

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveAccessibleName('Eliminar categoría');
    expect(within(dialogo).getByText(/Insumos/)).toBeInTheDocument();
    // Todavía no se ha borrado nada
    expect(useFinanceStore.getState().customExpenseCategories).toHaveLength(1);
  });

  it('cancelar la confirmación no borra', async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole('button', { name: /Eliminar/ }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(useFinanceStore.getState().customExpenseCategories).toHaveLength(1);
  });

  it('confirmar borra y deja tombstone para propagar el borrado', async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole('button', { name: /Eliminar/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }));

    expect(useFinanceStore.getState().customExpenseCategories).toHaveLength(0);
    // Sin tombstone, el pull del sync resucitaría la categoría borrada
    expect(useFinanceStore.getState().tombstones['custom_insumos']).toBeTruthy();
  });
});

describe('CategoryManager — acordeón', () => {
  it('plegado no muestra el formulario', () => {
    montar(false);
    expect(screen.queryByLabelText('Nombre de la nueva categoría')).not.toBeInTheDocument();
  });

  it('avisa al padre cuando se pulsa la cabecera', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<CategoryManager abierto={false} onToggle={onToggle} saveData={saveData} />);

    await user.click(screen.getByRole('button', { name: /Categorías personalizadas/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('la cabecera cuenta las categorías existentes', () => {
    useFinanceStore.setState({
      customExpenseCategories: [
        { id: 'a', label: 'A', icon: '📦', color: 'bg-slate-100' },
      ],
      customIncomeCategories: [
        { id: 'b', label: 'B', icon: '💰', color: 'bg-slate-100' },
      ],
    });
    montar(false);
    expect(screen.getByText('2 categorías creadas')).toBeInTheDocument();
  });
});
