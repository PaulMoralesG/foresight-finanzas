// ================================================================
// TESTS — TrendChart (SVG a mano que sustituye al LineChart de Recharts)
// ================================================================

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TrendChart, type TrendChartColors } from '@/components/features/stats/TrendChart';
import type { PuntoTendencia } from '@/hooks/useStatsPeriod';

const colores: TrendChartColors = {
  tick: '#5f5e58',
  grid: '#e6e4dd',
  tipBg: '#ffffff',
  tipFg: '#1a1a19',
  tipLabel: '#4a4944',
  income: '#1baf7a',
  expense: '#e34948',
  balance: '#4a4944',
};

const datos: PuntoTendencia[] = [
  { month: 'Mar', Ingresos: 5000, Gastos: 3000, Balance: 2000 },
  { month: 'Abr', Ingresos: 4000, Gastos: 4500, Balance: -500 },
  { month: 'May', Ingresos: 6000, Gastos: 2000, Balance: 4000 },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TrendChart', () => {
  it('dibuja las tres series con sus colores y el Balance discontinuo', () => {
    const { container } = render(<TrendChart data={datos} colors={colores} />);
    const paths = container.querySelectorAll('svg path');
    expect(paths).toHaveLength(3);
    const porColor = Array.from(paths).map((p) => p.getAttribute('stroke'));
    expect(porColor).toEqual([colores.income, colores.expense, colores.balance]);
    expect(paths[2].getAttribute('stroke-dasharray')).toBe('6 4');
    expect(paths[0].getAttribute('stroke-dasharray')).toBeNull();
  });

  it('etiqueta los meses en el eje X y el dinero abreviado en el eje Y', () => {
    render(<TrendChart data={datos} colors={colores} />);
    expect(screen.getByText('Mar')).toBeInTheDocument();
    expect(screen.getByText('May')).toBeInTheDocument();
    expect(screen.getByText('$0')).toBeInTheDocument();
    expect(screen.getByText('$6k')).toBeInTheDocument();
  });

  it('extiende el eje por debajo de cero cuando hay balance negativo', () => {
    render(<TrendChart data={datos} colors={colores} />);
    expect(screen.getByText('-$2k')).toBeInTheDocument();
  });

  it('muestra la leyenda con las tres series', () => {
    render(<TrendChart data={datos} colors={colores} />);
    const leyenda = screen.getByRole('list');
    expect(leyenda).toHaveTextContent('Ingresos');
    expect(leyenda).toHaveTextContent('Gastos');
    expect(leyenda).toHaveTextContent('Balance');
  });

  it('describe los datos para lectores de pantalla', () => {
    render(<TrendChart data={datos} colors={colores} />);
    const svg = screen.getByRole('img');
    expect(svg.getAttribute('aria-label')).toContain('Abr');
    expect(svg.getAttribute('aria-label')).toContain('balance');
  });

  it('abre un tooltip con los valores del mes bajo el puntero y lo cierra al salir', () => {
    // jsdom no mide nada: se fija un ancho para que la posición X tenga sentido.
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 520, height: 240, right: 520, bottom: 240, x: 0, y: 0, toJSON: () => ({}),
    });
    render(<TrendChart data={datos} colors={colores} />);
    const svg = screen.getByRole('img');

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    // Extremo derecho → último mes (May)
    fireEvent.pointerMove(svg, { clientX: 515 });
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('May');
    expect(tip).toHaveTextContent('$6,000.00');
    expect(tip).toHaveTextContent('$2,000.00');
    expect(tip).toHaveTextContent('$4,000.00');

    // Extremo izquierdo → primer mes (Mar)
    fireEvent.pointerMove(svg, { clientX: 5 });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Mar');

    fireEvent.pointerLeave(svg);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('no revienta con un solo mes ni con todo en cero', () => {
    const { container, rerender } = render(
      <TrendChart data={[{ month: 'Ene', Ingresos: 0, Gastos: 0, Balance: 0 }]} colors={colores} />
    );
    expect(container.querySelectorAll('svg path')).toHaveLength(3);
    rerender(<TrendChart data={[]} colors={colores} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
