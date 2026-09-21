// ================================================================
// DebtsPage — pendiente (spec: .agents/specs/fase-3-estructura-balance-dual.md)
// La vista ya existe en la navegación para que la app tenga su forma
// final; el contenido llega en su paso de la fase 3.
// ================================================================

import { CreditCard } from '@/components/ui/icons.generated';
import { EmptyState } from '@/components/ui/EmptyState';
import { vistaPorId } from '@/config/views';

export function DebtsPage() {
  const vista = vistaPorId('debts');
  return (
    <div className="space-y-4 animate-fade-in">
      <EmptyState
        icon={CreditCard}
        title={vista.label}
        description={vista.descripcion + ' Esta sección está en construcción.'}
      />
    </div>
  );
}
