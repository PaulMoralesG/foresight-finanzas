// ================================================================
// UTILIDADES
// ================================================================

/**
 * Formatea un número como moneda MXN.
 */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Convierte un string de monto a número, aceptando tanto coma (,) como
 * punto (.) como separador decimal. Esto permite que usuarios en móviles
 * (iPhone con teclado de coma) y desktop (punto) ingresen montos sin fricción.
 *
 * Heurística:
 * - Si hay ambos (coma y punto), el último es el decimal
 * - Si solo hay coma y le siguen 1-2 dígitos al final → decimal
 * - Si solo hay punto y le siguen 1-2 dígitos al final → decimal
 * - En cualquier otro caso → separadores de miles (se eliminan)
 *
 * Ejemplos: "1,50"→1.5  "1,000"→1000  "60.70"→60.7  "1.000,50"→1000.5
 */
export function parseMoneyInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  const hasComma = trimmed.includes(',');
  const hasDot = trimmed.includes('.');

  let normalized: string;

  if (hasComma && hasDot) {
    // Ambos presentes → el último es el decimal
    const lastComma = trimmed.lastIndexOf(',');
    const lastDot = trimmed.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Coma es decimal, punto es miles
      normalized = trimmed.replace(/\./g, '').replace(',', '.');
    } else {
      // Punto es decimal, coma es miles
      normalized = trimmed.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Solo coma: ¿decimal o miles?
    const lastCommaIdx = trimmed.lastIndexOf(',');
    const afterComma = trimmed.slice(lastCommaIdx + 1);
    // Si hay exactamente 1-2 dígitos después de la última coma → decimal
    if (/^\d{1,2}$/.test(afterComma) && trimmed.indexOf(',') === lastCommaIdx) {
      // Una sola coma con 1-2 dígitos después → decimal
      normalized = trimmed.replace(',', '.');
    } else {
      // Miles
      normalized = trimmed.replace(/,/g, '');
    }
  } else if (hasDot) {
    // Solo punto: ¿decimal o miles?
    const lastDotIdx = trimmed.lastIndexOf('.');
    const afterDot = trimmed.slice(lastDotIdx + 1);
    if (/^\d{1,2}$/.test(afterDot) && trimmed.indexOf('.') === lastDotIdx) {
      // Un solo punto con 1-2 dígitos después → decimal
      normalized = trimmed;
    } else {
      // Miles
      normalized = trimmed.replace(/\./g, '');
    }
  } else {
    normalized = trimmed;
  }

  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

/**
 * Obtiene la fecha de hoy en formato ISO local (YYYY-MM-DD).
 */
export function getTodayISO(): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Helper para sincronizar datos con el backend.
 * Muestra un toast de error si falla la sincronización.
 */
export function syncToCloud(
  saveData: () => Promise<boolean>,
  addToast: (msg: string, type: 'success' | 'error' | 'info') => void,
): void {
  saveData()
    .then((ok) => {
      if (!ok) addToast('Error al sincronizar con la nube', 'error');
    })
    .catch((err) => {
      console.error('[syncToCloud] Error de red al sincronizar:', err);
      addToast('Sin conexión — los cambios se guardarán localmente', 'error');
    });
}

/**
 * Nombres de meses en español.
 */
export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/**
 * Parsea una fecha ISO (YYYY-MM-DD) de forma segura en todos los navegadores.
 * `new Date('2026-07-15')` falla en Safari; `new Date(y, m-1, d)` no.
 */
export function safeParseDate(iso: string): Date {
  // Tomar solo YYYY-MM-DD (soporta ISO completo: 2026-02-13T17:00:00.000Z)
  const datePart = iso.substring(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Formatea una fecha ISO en texto largo: "1 de Mayo 2026".
 * Parsea manualmente para evitar bugs de zona horaria (new Date(iso+'T00:00:00') trata como UTC).
 */
export function formatDateLong(iso: string): string {
  // Tomar solo YYYY-MM-DD (soporta ISO completo)
  const datePart = iso.substring(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  return `${day} de ${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Detecta si la app se ejecuta como PWA standalone (instalada en pantalla de inicio).
 */
export function isPWAStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * Convierte un Blob a data URL (base64). Útil para PWA donde las blob URLs
 * no funcionan cross-origin al abrir en el navegador del sistema.
 */
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Descarga un archivo.
 * - Móviles (iOS Safari, Android Chrome): Web Share API → menú nativo de
 *   compartir/guardar (WhatsApp, Archivos, AirDrop, etc.).
 * - Escritorio: blob URL + <a download>.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  // Web Share API: funciona en iOS Safari 12.2+ y Android Chrome 75+
  if (navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
  }

  // Escritorio: blob URL + <a download>
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Abre un blob para previsualización.
 * - Navegador normal: blob URL + window.open.
 * - PWA standalone: data URL + window.open (las blob URLs no funcionan cross-origin).
 */
export async function previewBlob(blob: Blob): Promise<void> {
  if (isPWAStandalone()) {
    const dataUrl = await blobToDataURL(blob);
    window.open(dataUrl, '_blank');
  } else {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
