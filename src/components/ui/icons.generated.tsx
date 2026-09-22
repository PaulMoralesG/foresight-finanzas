// ================================================================
// GENERADO por scripts/generar-iconos.mjs a partir de lucide-react v1.28.0.
// No editar a mano: añadir el icono al script y volver a ejecutarlo.
//
// Trazos © Lucide Contributors, licencia ISC (https://lucide.dev/license).
// ================================================================

import { Icon, type IconProps } from './Icon';

export type IconName =
  | 'alert-circle'
  | 'alert-triangle'
  | 'arrow-down'
  | 'arrow-left'
  | 'arrow-left-right'
  | 'arrow-up'
  | 'banknote'
  | 'building-2'
  | 'calendar'
  | 'chart-no-axes-column'
  | 'check'
  | 'check-circle'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'chevrons-left'
  | 'chevrons-right'
  | 'cloud-off'
  | 'credit-card'
  | 'download'
  | 'edit-3'
  | 'ellipsis'
  | 'eye'
  | 'eye-off'
  | 'file-spreadsheet'
  | 'file-text'
  | 'gauge'
  | 'home'
  | 'key'
  | 'landmark'
  | 'layers'
  | 'layout-grid'
  | 'loader-2'
  | 'lock'
  | 'log-in'
  | 'log-out'
  | 'mail'
  | 'mail-check'
  | 'moon'
  | 'pencil'
  | 'piggy-bank'
  | 'plus'
  | 'printer'
  | 'receipt'
  | 'refresh-cw'
  | 'search'
  | 'send'
  | 'settings'
  | 'smartphone'
  | 'store'
  | 'sun'
  | 'tags'
  | 'target'
  | 'trash-2'
  | 'trending-up'
  | 'user'
  | 'user-plus'
  | 'wallet'
  | 'wifi'
  | 'wifi-off'
  | 'x';

/** Sprite con un <symbol> por icono. Se monta una vez (main.tsx); cada
 *  <Icon> lo referencia con <use href="#i-nombre"/>. */
const SPRITE = "<symbol id=\"i-alert-circle\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\"/><line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\"/></symbol><symbol id=\"i-alert-triangle\" viewBox=\"0 0 24 24\"><path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/></symbol><symbol id=\"i-arrow-down\" viewBox=\"0 0 24 24\"><path d=\"M12 5v14\"/><path d=\"m19 12-7 7-7-7\"/></symbol><symbol id=\"i-arrow-left\" viewBox=\"0 0 24 24\"><path d=\"m12 19-7-7 7-7\"/><path d=\"M19 12H5\"/></symbol><symbol id=\"i-arrow-left-right\" viewBox=\"0 0 24 24\"><path d=\"M8 3 4 7l4 4\"/><path d=\"M4 7h16\"/><path d=\"m16 21 4-4-4-4\"/><path d=\"M20 17H4\"/></symbol><symbol id=\"i-arrow-up\" viewBox=\"0 0 24 24\"><path d=\"m5 12 7-7 7 7\"/><path d=\"M12 19V5\"/></symbol><symbol id=\"i-banknote\" viewBox=\"0 0 24 24\"><rect width=\"20\" height=\"12\" x=\"2\" y=\"6\" rx=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"M6 12h.01M18 12h.01\"/></symbol><symbol id=\"i-building-2\" viewBox=\"0 0 24 24\"><path d=\"M10 12h4\"/><path d=\"M10 8h4\"/><path d=\"M14 21v-3a2 2 0 0 0-4 0v3\"/><path d=\"M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2\"/><path d=\"M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16\"/></symbol><symbol id=\"i-calendar\" viewBox=\"0 0 24 24\"><path d=\"M8 2v3\"/><path d=\"M16 2v3\"/><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18\"/></symbol><symbol id=\"i-chart-no-axes-column\" viewBox=\"0 0 24 24\"><path d=\"M5 21v-6\"/><path d=\"M12 21V3\"/><path d=\"M19 21V9\"/></symbol><symbol id=\"i-check\" viewBox=\"0 0 24 24\"><path d=\"M20 6 9 17l-5-5\"/></symbol><symbol id=\"i-check-circle\" viewBox=\"0 0 24 24\"><path d=\"M21.801 10A10 10 0 1 1 17 3.335\"/><path d=\"m9 11 3 3L22 4\"/></symbol><symbol id=\"i-chevron-down\" viewBox=\"0 0 24 24\"><path d=\"m6 9 6 6 6-6\"/></symbol><symbol id=\"i-chevron-left\" viewBox=\"0 0 24 24\"><path d=\"m15 18-6-6 6-6\"/></symbol><symbol id=\"i-chevron-right\" viewBox=\"0 0 24 24\"><path d=\"m9 18 6-6-6-6\"/></symbol><symbol id=\"i-chevron-up\" viewBox=\"0 0 24 24\"><path d=\"m18 15-6-6-6 6\"/></symbol><symbol id=\"i-chevrons-left\" viewBox=\"0 0 24 24\"><path d=\"m11 17-5-5 5-5\"/><path d=\"m18 17-5-5 5-5\"/></symbol><symbol id=\"i-chevrons-right\" viewBox=\"0 0 24 24\"><path d=\"m6 17 5-5-5-5\"/><path d=\"m13 17 5-5-5-5\"/></symbol><symbol id=\"i-cloud-off\" viewBox=\"0 0 24 24\"><path d=\"M10.94 5.274A7 7 0 0 1 15.71 10h1.79a4.5 4.5 0 0 1 4.222 6.057\"/><path d=\"M18.796 18.81A4.5 4.5 0 0 1 17.5 19H9A7 7 0 0 1 5.79 5.78\"/><path d=\"m2 2 20 20\"/></symbol><symbol id=\"i-credit-card\" viewBox=\"0 0 24 24\"><rect width=\"20\" height=\"14\" x=\"2\" y=\"5\" rx=\"2\"/><line x1=\"2\" x2=\"22\" y1=\"10\" y2=\"10\"/></symbol><symbol id=\"i-download\" viewBox=\"0 0 24 24\"><path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/></symbol><symbol id=\"i-edit-3\" viewBox=\"0 0 24 24\"><path d=\"M13 21h8\"/><path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/></symbol><symbol id=\"i-ellipsis\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/><circle cx=\"5\" cy=\"12\" r=\"1\"/></symbol><symbol id=\"i-eye\" viewBox=\"0 0 24 24\"><path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></symbol><symbol id=\"i-eye-off\" viewBox=\"0 0 24 24\"><path d=\"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49\"/><path d=\"M14.084 14.158a3 3 0 0 1-4.242-4.242\"/><path d=\"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143\"/><path d=\"m2 2 20 20\"/></symbol><symbol id=\"i-file-spreadsheet\" viewBox=\"0 0 24 24\"><path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M8 13h2\"/><path d=\"M14 13h2\"/><path d=\"M8 17h2\"/><path d=\"M14 17h2\"/></symbol><symbol id=\"i-file-text\" viewBox=\"0 0 24 24\"><path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 9H8\"/><path d=\"M16 13H8\"/><path d=\"M16 17H8\"/></symbol><symbol id=\"i-gauge\" viewBox=\"0 0 24 24\"><path d=\"m12 14 4-4\"/><path d=\"M3.34 19a10 10 0 1 1 17.32 0\"/></symbol><symbol id=\"i-home\" viewBox=\"0 0 24 24\"><path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\"/><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/></symbol><symbol id=\"i-key\" viewBox=\"0 0 24 24\"><path d=\"m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4\"/><path d=\"m21 2-9.6 9.6\"/><circle cx=\"7.5\" cy=\"15.5\" r=\"5.5\"/></symbol><symbol id=\"i-landmark\" viewBox=\"0 0 24 24\"><path d=\"M10 18v-7\"/><path d=\"M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z\"/><path d=\"M14 18v-7\"/><path d=\"M18 18v-7\"/><path d=\"M3 22h18\"/><path d=\"M6 18v-7\"/></symbol><symbol id=\"i-layers\" viewBox=\"0 0 24 24\"><path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\"/><path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\"/><path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\"/></symbol><symbol id=\"i-layout-grid\" viewBox=\"0 0 24 24\"><rect width=\"7\" height=\"7\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"14\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"14\" y=\"14\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"3\" y=\"14\" rx=\"1\"/></symbol><symbol id=\"i-loader-2\" viewBox=\"0 0 24 24\"><path d=\"M21 12a9 9 0 1 1-6.219-8.56\"/></symbol><symbol id=\"i-lock\" viewBox=\"0 0 24 24\"><rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/></symbol><symbol id=\"i-log-in\" viewBox=\"0 0 24 24\"><path d=\"m10 17 5-5-5-5\"/><path d=\"M15 12H3\"/><path d=\"M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4\"/></symbol><symbol id=\"i-log-out\" viewBox=\"0 0 24 24\"><path d=\"m16 17 5-5-5-5\"/><path d=\"M21 12H9\"/><path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"/></symbol><symbol id=\"i-mail\" viewBox=\"0 0 24 24\"><path d=\"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7\"/><rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\"/></symbol><symbol id=\"i-mail-check\" viewBox=\"0 0 24 24\"><path d=\"M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8\"/><path d=\"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7\"/><path d=\"m16 19 2 2 4-4\"/></symbol><symbol id=\"i-moon\" viewBox=\"0 0 24 24\"><path d=\"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401\"/></symbol><symbol id=\"i-pencil\" viewBox=\"0 0 24 24\"><path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/><path d=\"m15 5 4 4\"/></symbol><symbol id=\"i-piggy-bank\" viewBox=\"0 0 24 24\"><path d=\"M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z\"/><path d=\"M16 10h.01\"/><path d=\"M2 8v1a2 2 0 0 0 2 2h1\"/></symbol><symbol id=\"i-plus\" viewBox=\"0 0 24 24\"><path d=\"M5 12h14\"/><path d=\"M12 5v14\"/></symbol><symbol id=\"i-printer\" viewBox=\"0 0 24 24\"><path d=\"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2\"/><path d=\"M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6\"/><rect x=\"6\" y=\"14\" width=\"12\" height=\"8\" rx=\"1\"/></symbol><symbol id=\"i-receipt\" viewBox=\"0 0 24 24\"><path d=\"M12 17V7\"/><path d=\"M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8\"/><path d=\"M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z\"/></symbol><symbol id=\"i-refresh-cw\" viewBox=\"0 0 24 24\"><path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\"/><path d=\"M21 3v5h-5\"/><path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\"/><path d=\"M8 16H3v5\"/></symbol><symbol id=\"i-search\" viewBox=\"0 0 24 24\"><path d=\"m21 21-4.34-4.34\"/><circle cx=\"11\" cy=\"11\" r=\"8\"/></symbol><symbol id=\"i-send\" viewBox=\"0 0 24 24\"><path d=\"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z\"/><path d=\"m21.854 2.147-10.94 10.939\"/></symbol><symbol id=\"i-settings\" viewBox=\"0 0 24 24\"><path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></symbol><symbol id=\"i-smartphone\" viewBox=\"0 0 24 24\"><rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\"/><path d=\"M12 18h.01\"/></symbol><symbol id=\"i-store\" viewBox=\"0 0 24 24\"><path d=\"M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5\"/><path d=\"M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244\"/><path d=\"M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05\"/></symbol><symbol id=\"i-sun\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2\"/><path d=\"M12 20v2\"/><path d=\"m4.93 4.93 1.41 1.41\"/><path d=\"m17.66 17.66 1.41 1.41\"/><path d=\"M2 12h2\"/><path d=\"M20 12h2\"/><path d=\"m6.34 17.66-1.41 1.41\"/><path d=\"m19.07 4.93-1.41 1.41\"/></symbol><symbol id=\"i-tags\" viewBox=\"0 0 24 24\"><path d=\"M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1z\"/><path d=\"M2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193\"/><circle cx=\"10.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\"/></symbol><symbol id=\"i-target\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><circle cx=\"12\" cy=\"12\" r=\"6\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/></symbol><symbol id=\"i-trash-2\" viewBox=\"0 0 24 24\"><path d=\"M10 11v6\"/><path d=\"M14 11v6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/><path d=\"M3 6h18\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/></symbol><symbol id=\"i-trending-up\" viewBox=\"0 0 24 24\"><path d=\"M16 7h6v6\"/><path d=\"m22 7-8.5 8.5-5-5L2 17\"/></symbol><symbol id=\"i-user\" viewBox=\"0 0 24 24\"><path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/></symbol><symbol id=\"i-user-plus\" viewBox=\"0 0 24 24\"><path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><line x1=\"19\" x2=\"19\" y1=\"8\" y2=\"14\"/><line x1=\"22\" x2=\"16\" y1=\"11\" y2=\"11\"/></symbol><symbol id=\"i-wallet\" viewBox=\"0 0 24 24\"><path d=\"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1\"/><path d=\"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4\"/></symbol><symbol id=\"i-wifi\" viewBox=\"0 0 24 24\"><path d=\"M12 20h.01\"/><path d=\"M2 8.82a15 15 0 0 1 20 0\"/><path d=\"M5 12.859a10 10 0 0 1 14 0\"/><path d=\"M8.5 16.429a5 5 0 0 1 7 0\"/></symbol><symbol id=\"i-wifi-off\" viewBox=\"0 0 24 24\"><path d=\"M12 20h.01\"/><path d=\"M8.5 16.429a5 5 0 0 1 7 0\"/><path d=\"M5 12.859a10 10 0 0 1 5.17-2.69\"/><path d=\"M19 12.859a10 10 0 0 0-2.007-1.523\"/><path d=\"M2 8.82a15 15 0 0 1 4.177-2.643\"/><path d=\"M22 8.82a15 15 0 0 0-11.288-3.764\"/><path d=\"m2 2 20 20\"/></symbol><symbol id=\"i-x\" viewBox=\"0 0 24 24\"><path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/></symbol>";

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

export function AlertCircle(props: Props) {
  return <Icon name="alert-circle" {...props} />;
}

export function AlertTriangle(props: Props) {
  return <Icon name="alert-triangle" {...props} />;
}

export function ArrowDown(props: Props) {
  return <Icon name="arrow-down" {...props} />;
}

export function ArrowLeft(props: Props) {
  return <Icon name="arrow-left" {...props} />;
}

export function ArrowLeftRight(props: Props) {
  return <Icon name="arrow-left-right" {...props} />;
}

export function ArrowUp(props: Props) {
  return <Icon name="arrow-up" {...props} />;
}

export function Banknote(props: Props) {
  return <Icon name="banknote" {...props} />;
}

export function Building2(props: Props) {
  return <Icon name="building-2" {...props} />;
}

export function Calendar(props: Props) {
  return <Icon name="calendar" {...props} />;
}

export function ChartNoAxesColumn(props: Props) {
  return <Icon name="chart-no-axes-column" {...props} />;
}

export function Check(props: Props) {
  return <Icon name="check" {...props} />;
}

export function CheckCircle(props: Props) {
  return <Icon name="check-circle" {...props} />;
}

export function ChevronDown(props: Props) {
  return <Icon name="chevron-down" {...props} />;
}

export function ChevronLeft(props: Props) {
  return <Icon name="chevron-left" {...props} />;
}

export function ChevronRight(props: Props) {
  return <Icon name="chevron-right" {...props} />;
}

export function ChevronUp(props: Props) {
  return <Icon name="chevron-up" {...props} />;
}

export function ChevronsLeft(props: Props) {
  return <Icon name="chevrons-left" {...props} />;
}

export function ChevronsRight(props: Props) {
  return <Icon name="chevrons-right" {...props} />;
}

export function CloudOff(props: Props) {
  return <Icon name="cloud-off" {...props} />;
}

export function CreditCard(props: Props) {
  return <Icon name="credit-card" {...props} />;
}

export function Download(props: Props) {
  return <Icon name="download" {...props} />;
}

export function Edit3(props: Props) {
  return <Icon name="edit-3" {...props} />;
}

export function Ellipsis(props: Props) {
  return <Icon name="ellipsis" {...props} />;
}

export function Eye(props: Props) {
  return <Icon name="eye" {...props} />;
}

export function EyeOff(props: Props) {
  return <Icon name="eye-off" {...props} />;
}

export function FileSpreadsheet(props: Props) {
  return <Icon name="file-spreadsheet" {...props} />;
}

export function FileText(props: Props) {
  return <Icon name="file-text" {...props} />;
}

export function Gauge(props: Props) {
  return <Icon name="gauge" {...props} />;
}

export function Home(props: Props) {
  return <Icon name="home" {...props} />;
}

export function Key(props: Props) {
  return <Icon name="key" {...props} />;
}

export function Landmark(props: Props) {
  return <Icon name="landmark" {...props} />;
}

export function Layers(props: Props) {
  return <Icon name="layers" {...props} />;
}

export function LayoutGrid(props: Props) {
  return <Icon name="layout-grid" {...props} />;
}

export function Loader2(props: Props) {
  return <Icon name="loader-2" {...props} />;
}

export function Lock(props: Props) {
  return <Icon name="lock" {...props} />;
}

export function LogIn(props: Props) {
  return <Icon name="log-in" {...props} />;
}

export function LogOut(props: Props) {
  return <Icon name="log-out" {...props} />;
}

export function Mail(props: Props) {
  return <Icon name="mail" {...props} />;
}

export function MailCheck(props: Props) {
  return <Icon name="mail-check" {...props} />;
}

export function Moon(props: Props) {
  return <Icon name="moon" {...props} />;
}

export function Pencil(props: Props) {
  return <Icon name="pencil" {...props} />;
}

export function PiggyBank(props: Props) {
  return <Icon name="piggy-bank" {...props} />;
}

export function Plus(props: Props) {
  return <Icon name="plus" {...props} />;
}

export function Printer(props: Props) {
  return <Icon name="printer" {...props} />;
}

export function Receipt(props: Props) {
  return <Icon name="receipt" {...props} />;
}

export function RefreshCw(props: Props) {
  return <Icon name="refresh-cw" {...props} />;
}

export function Search(props: Props) {
  return <Icon name="search" {...props} />;
}

export function Send(props: Props) {
  return <Icon name="send" {...props} />;
}

export function Settings(props: Props) {
  return <Icon name="settings" {...props} />;
}

export function Smartphone(props: Props) {
  return <Icon name="smartphone" {...props} />;
}

export function Store(props: Props) {
  return <Icon name="store" {...props} />;
}

export function Sun(props: Props) {
  return <Icon name="sun" {...props} />;
}

export function Tags(props: Props) {
  return <Icon name="tags" {...props} />;
}

export function Target(props: Props) {
  return <Icon name="target" {...props} />;
}

export function Trash2(props: Props) {
  return <Icon name="trash-2" {...props} />;
}

export function TrendingUp(props: Props) {
  return <Icon name="trending-up" {...props} />;
}

export function User(props: Props) {
  return <Icon name="user" {...props} />;
}

export function UserPlus(props: Props) {
  return <Icon name="user-plus" {...props} />;
}

export function Wallet(props: Props) {
  return <Icon name="wallet" {...props} />;
}

export function Wifi(props: Props) {
  return <Icon name="wifi" {...props} />;
}

export function WifiOff(props: Props) {
  return <Icon name="wifi-off" {...props} />;
}

export function X(props: Props) {
  return <Icon name="x" {...props} />;
}
