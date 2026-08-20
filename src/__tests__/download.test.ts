import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBlob, toCsv } from '@/lib/utils';

/** Simula el entorno de un dispositivo: puntero, UA y disponibilidad de share */
function setDevice(opts: {
  coarse?: boolean;
  fine?: boolean;
  ua?: string;
  maxTouchPoints?: number;
  share?: boolean;
}) {
  const { coarse = false, fine = true, ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints = 0, share = true } = opts;

  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('any-pointer: fine') ? fine : q.includes('pointer: coarse') ? coarse : false,
    media: q,
  }));

  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });

  if (share) {
    Object.defineProperty(navigator, 'share', { value: vi.fn(() => Promise.resolve()), configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => true), configurable: true });
  } else {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  }
}

describe('downloadBlob', () => {
  let clicked: string[];

  beforeEach(() => {
    clicked = [];
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    });
    // Registrar cada <a download> que se dispare
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') el.click = () => { clicked.push((el as HTMLAnchorElement).download); };
      return el;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('en Windows con ratón descarga el archivo, NO abre el menú de compartir', async () => {
    // Este era el fallo: Chrome y Edge sobre Windows SÍ tienen navigator.share,
    // y la condición anterior solo miraba si la API existe. Resultado: en
    // escritorio se abría el diálogo de compartir de Windows en vez de guardar.
    setDevice({ coarse: false, fine: true, share: true });

    const outcome = await downloadBlob(new Blob(['x']), 'reporte.pdf');

    expect(outcome).toBe('downloaded');
    expect(navigator.share).not.toHaveBeenCalled();
    expect(clicked).toEqual(['reporte.pdf']);
  });

  it('en un portátil Windows táctil (puntero grueso + ratón) también descarga', async () => {
    setDevice({ coarse: true, fine: true, share: true });
    const outcome = await downloadBlob(new Blob(['x']), 'reporte.pdf');
    expect(outcome).toBe('downloaded');
    expect(navigator.share).not.toHaveBeenCalled();
  });

  it('en iPhone usa el menú de compartir', async () => {
    setDevice({ coarse: true, fine: false, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', share: true });
    const outcome = await downloadBlob(new Blob(['x']), 'reporte.pdf');
    expect(outcome).toBe('shared');
    expect(navigator.share).toHaveBeenCalled();
    expect(clicked).toEqual([]);
  });

  it('en Android (táctil, sin ratón) usa el menú de compartir', async () => {
    setDevice({ coarse: true, fine: false, ua: 'Mozilla/5.0 (Linux; Android 14)', share: true });
    expect(await downloadBlob(new Blob(['x']), 'r.pdf')).toBe('shared');
  });

  it('cancelar el menú de compartir NO es un error', async () => {
    // Antes, el AbortError subía hasta el catch del componente y el usuario
    // veía "Error al descargar el Excel" por el simple hecho de cerrar el menú.
    setDevice({ coarse: true, fine: false, ua: 'iPhone', share: true });
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(() => Promise.reject(new DOMException('cancelado', 'AbortError'))),
      configurable: true,
    });

    const outcome = await downloadBlob(new Blob(['x']), 'reporte.pdf');

    expect(outcome).toBe('cancelled');
    expect(clicked).toEqual([]); // cancelar tampoco debe forzar una descarga
  });

  it('si compartir falla por activación caducada, cae a la descarga normal', async () => {
    // navigator.share() exige activación de usuario reciente. Generar el PDF
    // tarda lo suficiente como para que caduque, y entonces lanzaba
    // NotAllowedError sin llegar nunca a la descarga de respaldo.
    setDevice({ coarse: true, fine: false, ua: 'iPhone', share: true });
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(() => Promise.reject(new DOMException('gesto requerido', 'NotAllowedError'))),
      configurable: true,
    });

    const outcome = await downloadBlob(new Blob(['x']), 'reporte.pdf');

    expect(outcome).toBe('downloaded');
    expect(clicked).toEqual(['reporte.pdf']);
  });

  it('sin Web Share disponible, descarga', async () => {
    setDevice({ share: false });
    expect(await downloadBlob(new Blob(['x']), 'r.csv')).toBe('downloaded');
    expect(clicked).toEqual(['r.csv']);
  });
});

describe('toCsv', () => {
  const read = (b: Blob) => b.text();

  it('escapa las comas de TODAS las celdas, no solo del concepto', async () => {
    // El fallo: StatsPage entrecomillaba únicamente el concepto, así que una
    // categoría como «Comida, bebida» partía la fila en una columna de más y
    // Excel abría el archivo descuadrado a partir de ahí.
    const csv = await read(toCsv(['Categoría', 'Monto'], [['Comida, bebida', '10.00']]));
    const linea = csv.split('\r\n')[1];
    expect(linea).toBe('"Comida, bebida","10.00"');
  });

  it('duplica las comillas internas', async () => {
    const csv = await read(toCsv(['Concepto'], [['Pago "urgente"']]));
    expect(csv.split('\r\n')[1]).toBe('"Pago ""urgente"""');
  });

  it('empieza por BOM para que Excel detecte UTF-8', async () => {
    // Hay que mirar los BYTES: Blob.text() decodifica como UTF-8 y el propio
    // spec descarta el BOM inicial, así que leyendo texto nunca se vería.
    const bytes = new Uint8Array(await toCsv(['Categoría'], [['Café']]).arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(await read(toCsv(['Categoría'], [['Café']]))).toContain('Café');
  });

  it('tolera celdas vacías, null y numéricas', async () => {
    const csv = await read(toCsv(['A', 'B', 'C'], [['', null as unknown as string, 42]]));
    expect(csv.split('\r\n')[1]).toBe('"","","42"');
  });

  it('mantiene los saltos de línea dentro de una celda entrecomillada', async () => {
    const csv = await read(toCsv(['Nota'], [['linea1\nlinea2']]));
    expect(csv).toContain('"linea1\nlinea2"');
  });
});
