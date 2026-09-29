// ================================================================
// TESTS — DebtsPage (Deudas) y el store: pago, ajustes y migración v10
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DebtsPage } from '@/pages/DebtsPage';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { TRANSFER_CATEGORY } from '@/lib/accounts';

beforeEach(() => {
  cleanup();
  useFinanceStore.getState().reset();
  useUiStore.setState({ toasts: [] });
});

// La fila de una deuda en «Orden de pago» (su nombre también sale en el aviso de pago variable).
const filaDe = (nombre: string): HTMLElement =>
  within(screen.getByRole('heading', { name: 'Orden de pago' }).closest('.saas-card') as HTMLElement)
    .getAllByRole('listitem')
    .find((li) => li.textContent?.includes(nombre)) as HTMLElement;

describe('DebtsPage', () => {
  it('sin deudas muestra el vacío', () => {
    render(<DebtsPage />);
    expect(screen.getByText('Sin deudas registradas')).toBeInTheDocument();
  });

  it('crea una deuda desde el formulario', async () => {
    render(<DebtsPage />);
    // Hay dos botones "Agregar deuda" (cabecera y vacío): vale cualquiera
    await userEvent.click(screen.getAllByRole('button', { name: 'Agregar deuda' })[0]);
    const dialogo = screen.getByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText('Nombre'), 'Préstamo moto');
    await userEvent.selectOptions(within(dialogo).getByLabelText('Tipo'), 'Préstamo');
    await userEvent.type(within(dialogo).getByLabelText('Saldo actual'), '3600');
    await userEvent.type(within(dialogo).getByLabelText('Interés anual (%)'), '19');
    await userEvent.type(within(dialogo).getByLabelText('Pago mínimo (opcional)'), '180');
    await userEvent.type(within(dialogo).getByLabelText('Día de pago del mes (opcional)'), '5');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear' }));

    const d = useFinanceStore.getState().debts;
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ name: 'Préstamo moto', kind: 'Préstamo', balance: 3600, annualRate: 19, minPayment: 180, payDay: 5, tag: 'personal' });
  });

  it('crear una deuda sin pago mínimo la guarda con 0 y muestra «pago variable»', async () => {
    render(<DebtsPage />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Agregar deuda' })[0]);
    const dialogo = screen.getByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText('Nombre'), 'Tarjeta variable');
    await userEvent.type(within(dialogo).getByLabelText('Saldo actual'), '800');
    await userEvent.type(within(dialogo).getByLabelText('Interés anual (%)'), '16');
    expect(within(dialogo).getByLabelText('Pago mínimo (opcional)')).not.toBeRequired();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear' }));

    expect(useFinanceStore.getState().debts[0]).toMatchObject({ name: 'Tarjeta variable', minPayment: 0 });
    const fila = filaDe('Tarjeta variable');
    expect(fila).toHaveTextContent('pago variable');
    expect(fila).toHaveTextContent('sin proyección');
    expect(fila).not.toHaveTextContent('mínimo $0.00');
  });

  it('las deudas con pago variable quedan fuera de la proyección, con aviso, y no rompen el plan de las demás', () => {
    useFinanceStore.getState().addDebt({ name: 'Moto', tag: 'personal', kind: 'Préstamo', balance: 3600, annualRate: 19, minPayment: 180, payDay: null });
    useFinanceStore.getState().addDebt({ name: 'Visa variable', tag: 'personal', kind: 'Tarjeta de crédito', balance: 900, annualRate: 30, minPayment: 0, payDay: null });
    render(<DebtsPage />);

    expect(screen.getByText('Libre de deudas').parentElement).toHaveTextContent(/en \d+ meses/);
    expect(screen.getByText('Pago mensual').parentElement).toHaveTextContent('1 con pago variable');
    expect(screen.getByRole('status')).toHaveTextContent(/Visa variable/);
    expect(screen.getByRole('status')).toHaveTextContent(/fuera de la proyección/);
    const orden = screen.getByRole('heading', { name: 'Orden de pago' }).closest('.saas-card') as HTMLElement;
    const items = within(orden).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Moto');
    expect(items[1]).toHaveTextContent('Visa variable');
    expect(items[1]).toHaveTextContent('pago variable');
  });

  it('si todas las deudas son de pago variable no hay fecha libre de deudas ni alerta de plan roto', () => {
    useFinanceStore.getState().addDebt({ name: 'Visa variable', tag: 'personal', kind: 'Tarjeta de crédito', balance: 900, annualRate: 30, minPayment: 0, payDay: null });
    render(<DebtsPage />);
    expect(screen.getByText('Libre de deudas').parentElement).toHaveTextContent('—');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('muestra KPIs, orden de pago y la fecha libre de deudas', () => {
    useFinanceStore.getState().addDebt({ name: 'Tarjeta', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1240, annualRate: 22, minPayment: 85, payDay: 15 });
    useFinanceStore.getState().addDebt({ name: 'Moto', tag: 'personal', kind: 'Préstamo', balance: 3600, annualRate: 19, minPayment: 180, payDay: null });
    render(<DebtsPage />);

    expect(screen.getByText('Deuda total').parentElement).toHaveTextContent('$4,840.00');
    expect(screen.getByText('Pago mensual').parentElement).toHaveTextContent('$265.00');
    expect(screen.getByText('Libre de deudas').parentElement).toHaveTextContent(/en \d+ meses/);
    // Bola de nieve: saldo menor primero
    const orden = screen.getByRole('heading', { name: 'Orden de pago' }).closest('.saas-card') as HTMLElement;
    const items = within(orden).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Tarjeta');
    expect(items[1]).toHaveTextContent('Moto');
    expect(screen.getByRole('img', { name: /Saldo de deuda proyectado/ })).toBeInTheDocument();
  });

  it('avisa cuando el plan no cierra', () => {
    useFinanceStore.getState().addDebt({ name: 'Imposible', tag: 'personal', kind: 'Otro', balance: 10000, annualRate: 60, minPayment: 100, payDay: null });
    render(<DebtsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('los intereses crecen más rápido que los abonos');
  });

  it('cambiar el método lo guarda en ajustes y reordena', async () => {
    useFinanceStore.getState().addDebt({ name: 'Cara', tag: 'personal', kind: 'Otro', balance: 3000, annualRate: 30, minPayment: 120, payDay: null });
    useFinanceStore.getState().addDebt({ name: 'Barata', tag: 'personal', kind: 'Otro', balance: 1000, annualRate: 5, minPayment: 60, payDay: null });
    render(<DebtsPage />);
    // El método se elige tocando su bloque en "Bola de nieve vs. avalancha"
    await userEvent.click(screen.getByRole('button', { name: /^Avalancha/ }));
    expect(useFinanceStore.getState().settings.debtMethod).toBe('avalanche');
    expect(useFinanceStore.getState().settings.updated_at).not.toBe('');
    const orden = screen.getByRole('heading', { name: 'Orden de pago' }).closest('.saas-card') as HTMLElement;
    expect(within(orden).getAllByRole('listitem')[0]).toHaveTextContent('Cara');
  });

  it('registrar un pago baja el saldo y sale de la cuenta elegida como transferencia, no como gasto', async () => {
    const banco = useFinanceStore.getState().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 1000 });
    useFinanceStore.getState().addDebt({ name: 'Tarjeta', tag: 'business', kind: 'Tarjeta de crédito', balance: 500, annualRate: 22, minPayment: 85, payDay: null });
    render(<DebtsPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByLabelText('Monto')).toHaveValue('85'); // el mínimo, precargado
    expect(within(dialogo).getByLabelText('Cuenta de origen')).toHaveValue(banco); // sugerida
    expect(within(dialogo).queryByLabelText(/Contar como gasto/)).not.toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Registrar' }));

    const s = useFinanceStore.getState();
    expect(s.debts[0].balance).toBe(415);
    expect(s.expenses).toHaveLength(1);
    expect(s.expenses[0]).toMatchObject({ type: 'transfer', amount: 85, category: TRANSFER_CATEGORY, businessType: 'business', accountId: banco, toAccountId: null, debtId: s.debts[0].id });
  });

  it('el modal de pago precarga el pago de contado y la cuenta del último pago, con chips Contado / Mínimo', async () => {
    const st = useFinanceStore.getState();
    st.addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 1000 });
    const otra = st.addAccount({ name: 'Ahorros', kind: 'Efectivo', initialBalance: 500 });
    const id = st.addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1500, annualRate: 16, minPayment: 60, payDay: null, statementBalance: 480 });
    st.registerDebtPayment(id, { amount: 10, date: '2026-09-01', accountId: otra });
    render(<DebtsPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByLabelText('Monto')).toHaveValue('470'); // contado 480 − 10 ya pagado
    expect(within(dialogo).getByLabelText('Cuenta de origen')).toHaveValue(otra);
    await userEvent.click(within(dialogo).getByRole('button', { name: /Mínimo/ }));
    expect(within(dialogo).getByLabelText('Monto')).toHaveValue('60');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Contado/ }));
    expect(within(dialogo).getByLabelText('Monto')).toHaveValue('470');
  });

  it('un pago baja el saldo (nunca por debajo de cero) y queda en el historial como salida, no como gasto', () => {
    const id = useFinanceStore.getState().addDebt({ name: 'X', tag: 'personal', kind: 'Otro', balance: 50, annualRate: 0, minPayment: 10, payDay: null });
    useFinanceStore.getState().registerDebtPayment(id, { amount: 80, date: '2026-09-01', accountId: null });
    expect(useFinanceStore.getState().debts[0].balance).toBe(0);
    const [mov] = useFinanceStore.getState().expenses;
    expect(mov).toMatchObject({ type: 'transfer', amount: 80, debtId: id, toAccountId: null });
  });
});

describe('migración v10 del estado persistido (deudas y ajustes)', () => {
  it('añade debts vacío y settings por defecto', () => {
    const opciones = useFinanceStore.persist.getOptions();
    expect(opciones.version).toBeGreaterThanOrEqual(10);
    const migrado = opciones.migrate!({ expenses: [], savingsGoals: [], accounts: [] }, 9) as {
      debts: unknown[]; settings: { debtMethod: string; extraPayment: number; netWorthGoal: number; updated_at: string };
    };
    expect(migrado.debts).toEqual([]);
    expect(migrado.settings).toEqual({ debtMethod: 'snowball', extraPayment: 0, netWorthGoal: 0, updated_at: '' });
  });
});

describe('DebtsPage — historial de pagos', () => {
  it('muestra los pagos de la deuda con su etiqueta, lo pagado y el saldo tras cada pago', async () => {
    const user = userEvent.setup();
    const id = useFinanceStore.getState().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: null });
    useFinanceStore.getState().registerDebtPayment(id, { amount: 200, date: '2026-09-10', accountId: null });
    useFinanceStore.getState().registerDebtPayment(id, { amount: 100, date: '2026-09-20', accountId: null });
    render(<DebtsPage />);

    await user.click(screen.getByRole('button', { name: 'Historial de pagos (2)' }));
    const panel = document.getElementById(`historial-${id}`)!;
    expect(within(panel).getByText(/de \$1,000\.00/)).toBeInTheDocument(); // pagado 300 de 1,000
    expect(within(panel).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30');
    const filas = within(panel).getAllByRole('listitem');
    expect(filas[0]).toHaveTextContent('Pago de tarjeta · Visa');
    expect(filas[0]).toHaveTextContent('saldo $700.00');
    expect(filas[1]).toHaveTextContent('saldo $800.00');
    expect(panel).not.toHaveTextContent('gasto del mes');
  });

  it('«Pagos anteriores sin vincular»: vincular no cambia el saldo y el pago entra al historial; desvincular lo devuelve', async () => {
    const user = userEvent.setup();
    const st = useFinanceStore.getState();
    const id = st.addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: null });
    st.addTransaction({ type: 'expense', amount: 300, concept: 'Pago Visa (viejo)', date: '2026-08-15', category: 'pago-tarjetas', method: 'transfer', businessType: 'personal' });
    st.addTransaction({ type: 'expense', amount: 40, concept: 'Café', date: '2026-08-16', category: 'comida', method: 'cash', businessType: 'personal' });
    render(<DebtsPage />);

    await user.click(screen.getByRole('button', { name: /Historial de pagos \(0\)/ }));
    const panel = document.getElementById(`historial-${id}`)!;
    expect(within(panel).getByText(/Pagos anteriores sin vincular \(1\)/)).toBeInTheDocument();
    expect(within(panel).queryByText('Café')).not.toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: /Vincular \(no cambia el saldo\)/ }));
    let s = useFinanceStore.getState();
    expect(s.debts[0].balance).toBe(1000); // saldo intacto
    expect(s.expenses.find((e) => e.concept === 'Pago Visa (viejo)')?.debtId).toBe(id);
    expect(within(panel).getByText('Pago de tarjeta · Visa')).toBeInTheDocument();
    expect(within(panel).queryByText(/Pagos anteriores sin vincular/)).not.toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: /Desvincular/ }));
    s = useFinanceStore.getState();
    expect(s.debts[0].balance).toBe(1000);
    expect(s.expenses.find((e) => e.concept === 'Pago Visa (viejo)')?.debtId).toBeUndefined();
    expect(within(panel).getByText(/Pagos anteriores sin vincular \(1\)/)).toBeInTheDocument();
  });

  it('tarjeta: datos del estado de cuenta en el formulario, resumen y actualización por corte', async () => {
    render(<DebtsPage />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Agregar deuda' })[0]);
    const dialogo = screen.getByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText('Nombre'), 'Visa');
    await userEvent.selectOptions(within(dialogo).getByLabelText('Tipo'), 'Tarjeta de crédito');
    await userEvent.type(within(dialogo).getByLabelText('Saldo actual'), '1500');
    await userEvent.type(within(dialogo).getByLabelText('Interés anual (%)'), '16');
    await userEvent.type(within(dialogo).getByLabelText('Pago mínimo (opcional)'), '60');
    await userEvent.type(within(dialogo).getByLabelText('Día de corte'), '28');
    await userEvent.type(within(dialogo).getByLabelText('Pagar hasta (día)'), '10');
    await userEvent.type(within(dialogo).getByLabelText('Pago de contado'), '480');
    await userEvent.type(within(dialogo).getByLabelText('Cupo total'), '2000');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear' }));

    expect(useFinanceStore.getState().debts[0]).toMatchObject({ cutDay: 28, payDay: 10, statementBalance: 480, creditLimit: 2000 });
    expect(screen.getByText(/para no pagar intereses/)).toHaveTextContent('Pagar $480.00 antes del');
    expect(screen.getByText('Cupo disponible').parentElement).toHaveTextContent('$500.00 de $2,000.00');
    expect(screen.getByRole('progressbar', { name: /75% del cupo en uso/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar estado de cuenta' }));
    const estado = screen.getByRole('dialog');
    const total = within(estado).getByLabelText('Deuda total');
    await userEvent.clear(total);
    await userEvent.type(total, '1200');
    const contado = within(estado).getByLabelText('Pago de contado');
    await userEvent.clear(contado);
    await userEvent.type(contado, '0');
    await userEvent.click(within(estado).getByRole('button', { name: 'Guardar' }));

    expect(useFinanceStore.getState().debts[0]).toMatchObject({ balance: 1200, statementBalance: 0, minPayment: 60 });
    expect(screen.getByText(/Pago de contado cubierto/)).toBeInTheDocument();
  });

  it('tarjeta: la primera línea es «Pagar $X antes del …» con el contado, y va antes de los botones', () => {
    useFinanceStore.getState().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1500, annualRate: 16, minPayment: 60, payDay: 10, cutDay: 28, statementBalance: 480 });
    render(<DebtsPage />);
    const fila = screen.getByText('Visa').closest('li') as HTMLElement;
    const linea = within(fila).getByText(/Pagar \$480\.00 antes del/);
    expect(linea).toHaveTextContent(/faltan \d+ días?|vence hoy/);
    const boton = within(fila).getByRole('button', { name: 'Registrar pago' });
    expect(linea.compareDocumentPosition(boton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(fila).getByText(/Corte:/)).toBeInTheDocument();
  });

  it('tarjeta sin contado usa el mínimo como monto y lo dice; sin nada, solo la fecha', () => {
    const st = useFinanceStore.getState();
    st.addDebt({ name: 'ConMin', tag: 'personal', kind: 'Tarjeta de crédito', balance: 900, annualRate: 0, minPayment: 45, payDay: 12 });
    st.addDebt({ name: 'SinNada', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1200, annualRate: 0, minPayment: 0, payDay: 12 });
    render(<DebtsPage />);
    const conMin = screen.getByText('ConMin').closest('li') as HTMLElement;
    expect(within(conMin).getByText(/Pagar \$45\.00 mínimo antes del/)).toBeInTheDocument();
    const sinNada = filaDe('SinNada');
    expect(within(sinNada).getByText(/^Paga antes del/)).toBeInTheDocument();
  });

  it('interés estimado sobre el saldo que queda tras pagar de contado: solo con tasa > 0, contado > 0 y saldo mayor que él', () => {
    const st = useFinanceStore.getState();
    st.addDebt({ name: 'ConTasa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1200, annualRate: 24, minPayment: 40, payDay: 12, statementBalance: 300 });
    st.addDebt({ name: 'TasaCero', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1200, annualRate: 0, minPayment: 40, payDay: 12, statementBalance: 300 });
    st.addDebt({ name: 'TodoContado', tag: 'personal', kind: 'Tarjeta de crédito', balance: 300, annualRate: 24, minPayment: 40, payDay: 12, statementBalance: 300 });
    st.addDebt({ name: 'ContadoCubierto', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1200, annualRate: 24, minPayment: 40, payDay: 12, statementBalance: 0 });
    st.addDebt({ name: 'SinContado', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1200, annualRate: 24, minPayment: 40, payDay: 12 });
    render(<DebtsPage />);
    const con = screen.getByText('ConTasa').closest('li') as HTMLElement;
    const linea = within(con).getByText(/Si pagas solo el pago de contado/);
    // Interés sobre 1200 − 300 = 900 al 24 % anual (no sobre los 1200 completos).
    expect(linea).toHaveTextContent('el saldo restante generaría ~$18.00 de interés al mes');
    expect(linea).toHaveTextContent('consulta tu estado de cuenta');
    for (const nombre of ['TasaCero', 'TodoContado', 'ContadoCubierto', 'SinContado']) {
      expect(within(screen.getByText(nombre).closest('li') as HTMLElement).queryByText(/Si pagas solo el pago de contado/)).not.toBeInTheDocument();
    }
  });

  it('un préstamo no muestra nada de tarjeta', () => {
    useFinanceStore.getState().addDebt({ name: 'Moto', tag: 'personal', kind: 'Préstamo', balance: 3600, annualRate: 19, minPayment: 180, payDay: null });
    render(<DebtsPage />);
    expect(screen.queryByRole('button', { name: 'Actualizar estado de cuenta' })).not.toBeInTheDocument();
    expect(screen.queryByText('Cupo disponible')).not.toBeInTheDocument();
  });

  it('«Desvincular» aparece en un pago vinculado a mano y no en un pago real que bajó la deuda', async () => {
    const user = userEvent.setup();
    const st = useFinanceStore.getState();
    const id = st.addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: null });
    // Un gasto antiguo enlazado desde el modal, que sí bajó la deuda (queda su descuento)
    st.addTransaction({ type: 'expense', amount: 100, concept: 'Pago real', date: '2026-09-10', category: 'pago-tarjetas', method: 'cash', businessType: 'personal', debtId: id });
    // Otro histórico vinculado a mano
    const viejo = st.addTransaction({ type: 'expense', amount: 300, concept: 'Pago Visa (viejo)', date: '2026-08-15', category: 'pago-tarjetas', method: 'cash', businessType: 'personal' });
    st.vincularPagoHistorico(viejo, id);
    expect(useFinanceStore.getState().debts[0].balance).toBe(900);
    render(<DebtsPage />);

    await user.click(screen.getByRole('button', { name: /Historial de pagos \(2\)/ }));
    const panel = document.getElementById(`historial-${id}`)!;
    const botones = within(panel).getAllByRole('button', { name: /Desvincular/ });
    expect(botones).toHaveLength(1);
    expect(botones[0]).toHaveAccessibleName(/\$300\.00/);
  });
});
