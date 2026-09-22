// ================================================================
// UTILIDADES
// ================================================================

/**
 * Locale único de la app.
 *
 * Convivían tres: los importes y casi todas las fechas en `es-MX`, el mes del
 * saldo del dashboard en `es-EC` y el CSV en `es-ES`. La diferencia se veía —
 * `es-ES` escribe la fecha como dd/mm/yyyy y `es-MX` como d/m/yyyy—, y nada
 * garantizaba que las tres se movieran juntas. Un solo sitio que cambiar.
 */
export const LOCALE = 'es-MX';

/**
 * Formatea un número como moneda MXN.
 */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(amount));
}

/**
 * Redondeo aritmético seguro a 2 decimales para operaciones financieras (evita float drift IEEE 754).
 */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
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
 *
 * `saveData()` (syncService.schedule/flush) NUNCA rechaza — atrapa sus
 * propios errores de red/reintento y resuelve `false` en caso de fallo.
 * Antes este helper solo miraba `.catch()`, así que un push fallido tras
 * agotar los reintentos quedaba en silencio total. Ahora se revisa el
 * resultado booleano explícitamente.
 */
export function syncToCloud(
  saveData: () => Promise<boolean>,
  addToast: (msg: string, type: 'success' | 'error' | 'info') => void,
): void {
  saveData()
    .then((ok) => {
      if (!ok) {
        addToast('No se pudo guardar en la nube. Tus cambios quedaron solo en este dispositivo.', 'error');
      }
    })
    .catch((err: Error) => {
      console.error('[syncToCloud] Error al sincronizar:', err);
      addToast(err.message || 'Error al sincronizar con la nube', 'error');
    });
}

/**
 * Nombres de meses en español.
 */
export const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => {
  const name = new Intl.DateTimeFormat(LOCALE, { month: 'long' }).format(new Date(2024, i, 1));
  return name.charAt(0).toUpperCase() + name.slice(1);
});

/**
 * Parsea una fecha ISO (YYYY-MM-DD) de forma segura en todos los navegadores.
 * `new Date('2026-07-15')` falla en Safari; `new Date(y, m-1, d)` no.
 */
export function safeParseDate(iso: string): Date {
  // Tomar solo YYYY-MM-DD (soporta ISO completo: 2026-02-13T17:00:00.000Z)
  if (!iso || typeof iso !== 'string') return new Date();
  const datePart = iso.substring(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export type DownloadOutcome = 'downloaded' | 'shared' | 'cancelled';

/**
 * ¿Conviene abrir el menú nativo de compartir en vez de descargar el archivo?
 *
 * La versión anterior preguntaba solo si la API EXISTE (`navigator.share &&
 * navigator.canShare`), y eso es cierto también en Chrome y Edge sobre
 * Windows. Resultado: en escritorio se abría el diálogo de compartir de
 * Windows en lugar de guardar el archivo, justo lo contrario de lo que decía
 * el comentario de la función.
 *
 * Ahora se decide por DISPOSITIVO: el menú de compartir solo se usa donde
 * `<a download>` no es fiable —iOS/iPadOS Safari— o donde no hay ratón con el
 * que manejar una descarga. Un portátil Windows con pantalla táctil tiene
 * puntero grueso Y fino, así que recibe la descarga normal.
 */
function prefersShareSheet(): boolean {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;

  // iOS / iPadOS: Safari ignora el atributo `download` en muchos casos
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIOS) return true;

  if (typeof window === 'undefined' || !window.matchMedia) return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const hasMouse = window.matchMedia('(any-pointer: fine)').matches;
  return coarse && !hasMouse;
}

/** Descarga clásica: blob URL + <a download>. */
function anchorDownload(blob: Blob, filename: string): DownloadOutcome {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

/**
 * Guarda un archivo en el dispositivo.
 * - Móvil: menú nativo de compartir/guardar (WhatsApp, Archivos, AirDrop…).
 * - Escritorio: descarga normal del navegador.
 *
 * NUNCA lanza por culpa del menú de compartir. Antes sí lo hacía, y eso
 * producía los dos fallos que se veían en la app:
 *
 *  · `navigator.share()` exige activación de usuario RECIENTE. Los dos flujos
 *    de PDF (cuando aún existían: hoy el PDF sale de window.print) hacían
 *    `await generatePDFReport(...)` antes de llamar aquí, y generar el PDF
 *    tardaba lo suficiente como para que la activación caducara: la llamada
 *    fallaba con NotAllowedError, la excepción subía hasta el `catch` del
 *    componente y el usuario veía "Error al generar el PDF" — sin llegar
 *    nunca a la descarga de respaldo. El CSV sigue pasando por aquí.
 *  · Cerrar el menú de compartir rechaza con AbortError. Cancelar no es un
 *    error, pero acababa en el mismo `catch`: "Error al descargar el Excel".
 *
 * Ahora un fallo al compartir cae a la descarga normal, y una cancelación se
 * informa como tal para que el llamador no cante un éxito que no ocurrió.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<DownloadOutcome> {
  if (prefersShareSheet()) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return 'shared';
      } catch (err) {
        // El usuario cerró el menú: no es un fallo, no hay nada que reintentar
        if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
        // Cualquier otra cosa (activación caducada, tipo no permitido,
        // el sistema no ofrece destino): seguir por la descarga normal
        console.warn('[downloadBlob] Compartir falló, usando descarga directa:', err);
      }
    }
  }

  return anchorDownload(blob, filename);
}

/**
 * Ordena movimientos cronológicamente (del más antiguo al más reciente).
 *
 * Ni el PDF ni el CSV ordenaban nada: tomaban los movimientos en el orden en
 * que estuvieran en el store, y ese orden NO es cronológico:
 *
 *  · `addTransaction` añade al final, así que registrar hoy un gasto de enero
 *    lo deja detrás de uno de agosto.
 *  · El pull del sync trae las filas con `order by updated_at, id`, de modo
 *    que tras sincronizar el orden pasa a ser "por última edición".
 *
 * Por eso el reporte salía con días y meses entremezclados — y se notaba más
 * en el reporte por rango, donde el desorden cruza varios meses. La lista de
 * Movimientos sí ordena por su cuenta, así que en pantalla se veía bien y solo
 * fallaba al exportar.
 *
 * Se compara el texto ISO (YYYY-MM-DD) directamente: ordena igual que la fecha
 * y evita cualquier problema de zona horaria. Desempate por `created_at` para
 * que dos movimientos del mismo día salgan en el orden en que se registraron.
 */
export function sortByDateAsc<T extends { date: string; created_at?: string; id: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const byDate = (a.date ?? '').slice(0, 10).localeCompare((b.date ?? '').slice(0, 10));
    if (byDate !== 0) return byDate;
    const byCreated = (a.created_at ?? '').localeCompare(b.created_at ?? '');
    if (byCreated !== 0) return byCreated;
    return a.id.localeCompare(b.id); // determinista aunque falte created_at
  });
}

/**
 * Serializa filas a CSV escapando TODAS las celdas.
 *
 * Estaba duplicado, y solo una de las dos copias lo hacía bien: la de
 * StatsPage entrecomillaba únicamente el concepto, así que una categoría con
 * coma —«Comida, bebida», fácil de crear— desplazaba las columnas y Excel
 * abría el archivo descuadrado a partir de esa fila.
 *
 * El BOM va delante para que Excel detecte UTF-8 y no rompa los acentos.
 */
export function toCsv(headers: string[], rows: (string | number)[][]): Blob {
  const cell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
  // String.fromCharCode y no un BOM literal en el fuente: escrito de forma
  // directa es invisible al leer el código y frágil según cómo se guarde el
  // archivo (de hecho se perdió al escribir esta función, y lo cazó el test).
  const BOM = String.fromCharCode(0xfeff);
  return new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
}

/**
 * "Generado el 21/9/2026 a las 11:58", para el pie de cualquier vista de
 * impresión (reporte de movimientos, presupuesto, deudas, patrimonio...).
 */
export function generadoAhora(fecha = new Date()): string {
  const hh = String(fecha.getHours()).padStart(2, '0');
  const mm = String(fecha.getMinutes()).padStart(2, '0');
  return `Generado el ${fecha.getDate()}/${fecha.getMonth() + 1}/${fecha.getFullYear()} a las ${hh}:${mm}`;
}

/**
 * Iniciales para el avatar: nombre + apellido, o la primera letra del correo
 * si aún no hay nombre. La expresión estaba escrita tres veces —Header,
 * Sidebar y ProfilePage— y las tres tenían que coincidir para que el avatar no
 * cambiara de letra al navegar.
 */
export function userInitials(
  user: { firstName?: string; lastName?: string; email: string } | null,
): string {
  if (!user) return '?';
  const iniciales = ((user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '')).toUpperCase();
  return iniciales || user.email[0]?.toUpperCase() || '?';
}
