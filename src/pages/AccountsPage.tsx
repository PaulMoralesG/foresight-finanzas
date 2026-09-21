// ================================================================
// AccountsPage — pendiente (spec: .agents/specs/fase-3-estructura-balance-dual.md)
// La vista ya existe en la navegación para que la app tenga su forma
// final; el contenido llega en su paso de la fase 3.
// ================================================================

import { Wallet } from '@/components/ui/icons.generated';
import { EmptyState } from '@/components/ui/EmptyState';
import { vistaPorId } from '@/config/views';

export function AccountsPage() {
  const vista = vistaPorId('accounts');
  return (
    <div className="space-y-4 animate-fade-in">
      <EmptyState
        icon={Wallet}
        title={vista.label}
        description={vista.descripcion + ' Esta sección está en construcción.'}
      />
    </div>
  );
}
