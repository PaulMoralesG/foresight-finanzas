// ================================================================
// Genera src/components/ui/icons.generated.tsx a partir de lucide-react.
//
// La app ya no importa lucide-react en runtime: los trazos de los iconos
// que usa viven en un sprite SVG inline (<symbol>) y cada icono es un
// <svg><use href="#i-nombre"/></svg>. Este script copia los trazos tal
// cual del paquete instalado, para no reinventarlos ni desviarse del
// diseño original.
//
// Uso:  node scripts/generar-iconos.mjs
//       (lucide-react debe estar en node_modules como devDependency)
//
// Para añadir un icono: ponerlo en ICONOS y volver a ejecutar.
// ================================================================

import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirIconos = path.join(path.dirname(require.resolve('lucide-react/package.json')), 'dist/esm/icons');
const { version } = require('lucide-react/package.json');

/** Nombres tal como los exporta lucide-react (PascalCase). */
const ICONOS = [
  'AlertCircle', 'AlertTriangle', 'ArrowDown', 'ArrowLeft', 'ArrowLeftRight', 'ArrowUp',
  'Banknote', 'BarChart3', 'Building2', 'Calendar', 'CalendarClock', 'ChartNoAxesColumn',
  'Check', 'CheckCircle', 'ChevronDown', 'ChevronLeft', 'ChevronRight', 'ChevronUp',
  'ChevronsLeft', 'ChevronsRight', 'ClipboardList', 'CloudOff', 'CreditCard', 'Download',
  'Edit3', 'Ellipsis', 'Eye', 'EyeOff', 'FileSpreadsheet', 'FileText', 'Gauge', 'Home', 'Key',
  'Landmark', 'Layers', 'LayoutGrid', 'Loader2', 'Lock', 'LogIn', 'LogOut', 'Mail',
  'MailCheck', 'Moon', 'Pencil', 'PieChart', 'PiggyBank', 'Plus', 'Printer', 'Receipt',
  'RefreshCw', 'Search', 'Send', 'Settings', 'Smartphone', 'Store', 'Sun', 'Tags', 'Target',
  'Trash2', 'TrendingUp', 'User', 'UserPlus', 'Wallet', 'Wifi', 'WifiOff', 'X',
];

/** BarChart3 → bar-chart-3, EyeOff → eye-off */
const aKebab = (pascal) =>
  pascal
    .replace(/([a-z])([A-Z0-9])/g, '$1-$2')
    .replace(/([0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();

/** Sigue los alias (`export { default } from './circle-alert.mjs'`) hasta el
 *  módulo que define `__iconNode`. */
async function resolverModulo(kebab) {
  let archivo = path.join(dirIconos, `${kebab}.mjs`);
  for (let saltos = 0; saltos < 5; saltos++) {
    const fuente = await readFile(archivo, 'utf8');
    const alias = fuente.match(/export \{ default \} from '\.\/(.+)\.mjs'/);
    if (!alias) return archivo;
    archivo = path.join(dirIconos, `${alias[1]}.mjs`);
  }
  throw new Error(`Demasiados alias para ${kebab}`);
}

const escapar = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const simbolos = [];
const nombres = [];
for (const pascal of ICONOS) {
  const kebab = aKebab(pascal);
  const modulo = await resolverModulo(kebab);
  const { __iconNode } = await import(pathToFileURL(modulo).href);
  if (!Array.isArray(__iconNode)) throw new Error(`Sin __iconNode en ${modulo}`);
  const hijos = __iconNode
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${escapar(v)}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
  simbolos.push(`<symbol id="i-${kebab}" viewBox="0 0 24 24">${hijos}</symbol>`);
  nombres.push({ pascal, kebab });
}

const salida = `// ================================================================
// GENERADO por scripts/generar-iconos.mjs a partir de lucide-react v${version}.
// No editar a mano: añadir el icono al script y volver a ejecutarlo.
//
// Trazos © Lucide Contributors, licencia ISC (https://lucide.dev/license).
// ================================================================

import { Icon, type IconProps } from './Icon';

export type IconName =
${nombres.map((n) => `  | '${n.kebab}'`).join('\n')};

/** Sprite con un <symbol> por icono. Se monta una vez (main.tsx); cada
 *  <Icon> lo referencia con <use href="#i-nombre"/>. */
const SPRITE = ${JSON.stringify(simbolos.join(''))};

export function IconSprite() {
  // width/height 0 en vez de display:none: Safari no resuelve <use> hacia
  // símbolos dentro de un svg con display:none.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      dangerouslySetInnerHTML={{ __html: SPRITE }}
    />
  );
}

type Props = Omit<IconProps, 'name'>;

${nombres
  .map(
    (n) => `export function ${n.pascal}(props: Props) {
  return <Icon name="${n.kebab}" {...props} />;
}`,
  )
  .join('\n\n')}
`;

const destino = path.join(raiz, 'src/components/ui/icons.generated.tsx');
await writeFile(destino, salida, 'utf8');
console.log(`${nombres.length} iconos → ${path.relative(raiz, destino)} (lucide-react v${version})`);
