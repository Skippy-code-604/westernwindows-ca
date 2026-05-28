import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  Settings, Maximize2, XSquare, GripHorizontal, GripVertical,
  Download, Trash2, MousePointer2, Save, FolderOpen, Printer,
  Undo2, Redo2, Square, Plus, ArrowLeft, Copy, Edit2, CheckCircle, FileText
} from 'lucide-react';

// ─────────────────────────────────────────────
// TYPE DECLARATIONS
// ─────────────────────────────────────────────
declare global {
  interface Window {
    electronAPI?: {
      saveFile: (content: string) => Promise<{ success: boolean; filePath?: string }>;
      openFile: () => Promise<{ success: boolean; content?: string }>;
      exportSVG: (svg: string) => Promise<{ success: boolean }>;
      exportPDF: (html: string, name: string) => Promise<{ success: boolean }>;
      exportCSV: (csv: string, name: string) => Promise<{ success: boolean }>;
      print: () => Promise<void>;
    };
  }
}

type ProjectMode = 'window' | 'glass';
type WindowPaneType =
  | 'fixed' | 'slide-l' | 'slide-r' | 'slide-u' | 'slide-d'
  | 'casement-l' | 'casement-r' | 'awning' | 'hopper'
  | 'double-hung' | 'tilt-turn'
  | 'patio-xo' | 'patio-ox' | 'patio-xox' | 'patio-oxxxo'
  | 'bifold';
type GlassType = 'clear' | 'tempered' | 'laminated' | 'low-e' | 'frosted' | 'tinted' | 'starphire';
type EdgeFinish = 'seamed' | 'flat-ground' | 'polished' | 'beveled';
type GlassThickness = '1/4' | '3/8' | '1/2' | '5/8' | '3/4';
type AppView = 'project-manager' | 'unit-editor';

// IGU types
type LiteGlassType = 'clear' | 'tempered' | 'heat-strengthened' | 'laminated' | 'lam-tempered' | 'lam-hs';
type LiteTint = 'clear' | 'bronze' | 'grey' | 'green' | 'blue';
type LiteThicknessMM = '3' | '4' | '5' | '6' | '8' | '10' | '12';
type SpacerType = 'aluminum' | 'superspacer' | 'tgi' | 'swisspacer' | 'intercept' | 'foam';
type SpacerWidthMM = '6' | '8' | '10' | '11' | '12' | '13' | '14' | '16' | '19';
type GasFill = 'air' | 'argon-90' | 'argon-95' | 'krypton' | 'argon-krypton';
type IguBuild = 'single' | 'double' | 'triple';
type LamInterlayer = 'pvb-0.38' | 'pvb-0.76' | 'pvb-1.52' | 'sgp' | 'eva' | 'ionoplast';

interface LiteSpec {
  thicknessMM: LiteThicknessMM; // used for monolithic; ignored for lam if ply1MM/ply2MM set
  glassType: LiteGlassType;
  tint: LiteTint;
  hasLowE: boolean;
  lowEManufacturer?: string;
  lowEProduct?: string;
  lowESurface?: number;
  interlayer?: LamInterlayer;  // for laminated / lam-tempered / lam-hs
  ply1MM?: LiteThicknessMM;   // first ply thickness (lam types)
  ply2MM?: LiteThicknessMM;   // second ply thickness (lam types)
}
interface SpacerSpec {
  type: SpacerType;
  widthMM: SpacerWidthMM;
}
interface GlazingSpec {
  build: IguBuild;
  lite1: LiteSpec;
  spacer1?: SpacerSpec;
  gasFill1?: GasFill;
  lite2?: LiteSpec;
  spacer2?: SpacerSpec;
  gasFill2?: GasFill;
  lite3?: LiteSpec;
}

interface Cutout {
  id: string;
  x: number;        // inches from left edge of pane
  y: number;        // inches from top edge of pane
  diameter: number; // inches
  mirrored?: boolean; // auto-placed as L↔R mirror of another hole
}
interface PaneNode {
  id: string; type: 'pane'; paneType: WindowPaneType;
  glassType?: GlassType; glassThickness?: GlassThickness;
  edgeFinish?: EdgeFinish; cutouts?: Cutout[];
  mirrorCutouts?: boolean; // auto-mirror holes L↔R
}
interface SplitNode {
  id: string; type: 'split'; direction: 'V' | 'H';
  ratio: number; children: TreeNode[];
}
type TreeNode = PaneNode | SplitNode;

interface Unit {
  id: string;
  name: string;
  location: string;
  quantity: number;
  projectMode: ProjectMode;
  overallWidth: number;
  overallHeight: number;
  tree: TreeNode;
  glazingSpec: GlazingSpec;
}

interface Project {
  id: string;
  name: string;
  customer: string;
  date: string;
  notes: string;
  units: Unit[];
}

interface EditorState {
  tree: TreeNode;
  overallWidth: number;
  overallHeight: number;
  projectMode: ProjectMode;
}

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const uuid = () => Math.random().toString(36).substr(2, 9);

function toFraction(dec: number): string {
  if (dec <= 0) return '0"';
  const whole = Math.floor(dec);
  const frac = dec - whole;
  const sixteenths = Math.round(frac * 16);
  if (sixteenths === 0) return `${whole}"`;
  if (sixteenths === 16) return `${whole + 1}"`;
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const d = gcd(sixteenths, 16);
  return `${whole > 0 ? whole + '-' : ''}${sixteenths / d}/${16 / d}"`;
}

const FRAME_THICKNESS = 3.25;
const MULLION_THICKNESS = 2.0;
const SASH_PROFILE = 1.5;
const SNAP_POINTS = [1 / 3, 1 / 2, 2 / 3];
const SNAP_ZONE = 0.03;

const WINDOW_PANE_TYPES: { value: WindowPaneType; label: string; group: string }[] = [
  { value: 'fixed',       label: 'Fixed (Picture)',         group: 'Fixed' },
  { value: 'slide-l',    label: 'Slides Left',              group: 'Sliding' },
  { value: 'slide-r',    label: 'Slides Right',             group: 'Sliding' },
  { value: 'slide-u',    label: 'Single Hung — Up',         group: 'Hung' },
  { value: 'slide-d',    label: 'Single Hung — Down',       group: 'Hung' },
  { value: 'double-hung',label: 'Double Hung',              group: 'Hung' },
  { value: 'casement-l', label: 'Casement — Hinged Left',   group: 'Casement' },
  { value: 'casement-r', label: 'Casement — Hinged Right',  group: 'Casement' },
  { value: 'awning',     label: 'Awning — Hinged Top',      group: 'Casement' },
  { value: 'hopper',     label: 'Hopper — Hinged Bottom',   group: 'Casement' },
  { value: 'tilt-turn',  label: 'Tilt & Turn',              group: 'Casement' },
  { value: 'bifold',     label: 'Bi-fold',                  group: 'Specialty' },
];

const GLASS_TYPES: { value: GlassType; label: string }[] = [
  { value: 'clear', label: 'Clear Annealed' },
  { value: 'tempered', label: 'Tempered (Safety)' },
  { value: 'laminated', label: 'Laminated' },
  { value: 'low-e', label: 'Low-E Coated' },
  { value: 'frosted', label: 'Frosted / Obscure' },
  { value: 'tinted', label: 'Tinted' },
  { value: 'starphire', label: 'Starphire (Ultra-Clear)' },
];

const EDGE_FINISHES: { value: EdgeFinish; label: string }[] = [
  { value: 'seamed', label: 'Seamed' },
  { value: 'flat-ground', label: 'Flat Ground' },
  { value: 'polished', label: 'Polished' },
  { value: 'beveled', label: 'Beveled' },
];

const GLASS_FILL: Record<GlassType, string> = {
  clear: '#e0f2fe', tempered: '#dbeafe', laminated: '#ede9fe',
  'low-e': '#d1fae5', frosted: '#f1f5f9', tinted: '#fef9c3', starphire: '#f0fdfa',
};

// ─── IGU CONSTANTS ───────────────────────────
const LITE_THICKNESS_MM: { mm: LiteThicknessMM; label: string; frac: string }[] = [
  { mm: '3', label: '3mm', frac: '1/8"' },
  { mm: '4', label: '4mm', frac: '5/32"' },
  { mm: '5', label: '5mm', frac: '3/16"' },
  { mm: '6', label: '6mm', frac: '1/4"' },
  { mm: '8', label: '8mm', frac: '5/16"' },
  { mm: '10', label: '10mm', frac: '3/8"' },
  { mm: '12', label: '12mm', frac: '1/2"' },
];

const SPACER_WIDTHS: { mm: SpacerWidthMM; label: string; frac: string }[] = [
  { mm: '6',  label: '6mm',  frac: '1/4"' },
  { mm: '8',  label: '8mm',  frac: '5/16"' },
  { mm: '10', label: '10mm', frac: '3/8"' },
  { mm: '11', label: '11mm', frac: '7/16"' },
  { mm: '12', label: '12mm', frac: '1/2"' },
  { mm: '13', label: '13mm', frac: '—' },
  { mm: '14', label: '14mm', frac: '9/16"' },
  { mm: '16', label: '16mm', frac: '5/8"' },
  { mm: '19', label: '19mm', frac: '3/4"' },
];

const SPACER_TYPES: { value: SpacerType; label: string }[] = [
  { value: 'aluminum',    label: 'Aluminum (standard)' },
  { value: 'superspacer', label: 'Superspacer (TPS)' },
  { value: 'tgi',         label: 'TGI / Intercept' },
  { value: 'swisspacer',  label: 'Swisspacer' },
  { value: 'intercept',   label: 'Intercept U-channel' },
  { value: 'foam',        label: 'Foam Tape' },
];

const GAS_FILLS: { value: GasFill; label: string }[] = [
  { value: 'air',          label: 'Air' },
  { value: 'argon-90',     label: 'Argon 90%' },
  { value: 'argon-95',     label: 'Argon 95%' },
  { value: 'krypton',      label: 'Krypton' },
  { value: 'argon-krypton',label: 'Argon/Krypton Mix' },
];

const LITE_GLASS_TYPES: { value: LiteGlassType; label: string }[] = [
  { value: 'clear',             label: 'Clear Annealed' },
  { value: 'tempered',          label: 'Tempered' },
  { value: 'heat-strengthened', label: 'Heat Strengthened' },
  { value: 'laminated',         label: 'Laminated (Ann)' },
  { value: 'lam-tempered',      label: 'Lam Tempered' },
  { value: 'lam-hs',            label: 'Lam Heat Strengthened' },
];

const INTERLAYERS: { value: LamInterlayer; label: string; mm: number }[] = [
  { value: 'pvb-0.38',  label: '0.38mm PVB (standard)',   mm: 0.38 },
  { value: 'pvb-0.76',  label: '0.76mm PVB',              mm: 0.76 },
  { value: 'pvb-1.52',  label: '1.52mm PVB (heavy)',      mm: 1.52 },
  { value: 'sgp',       label: 'SentryGlas (SGP)',        mm: 0.89 },
  { value: 'eva',       label: 'EVA',                     mm: 0.38 },
  { value: 'ionoplast', label: 'Ionoplast',               mm: 0.89 },
];

const LITE_TINTS: { value: LiteTint; label: string; color: string }[] = [
  { value: 'clear',  label: 'Clear',  color: '#e0f2fe' },
  { value: 'bronze', label: 'Bronze', color: '#d97706' },
  { value: 'grey',   label: 'Grey',   color: '#9ca3af' },
  { value: 'green',  label: 'Green',  color: '#6ee7b7' },
  { value: 'blue',   label: 'Blue',   color: '#60a5fa' },
];

interface LowEProduct { name: string; surfaces: number[]; notes: string; }
interface LowEManufacturer { name: string; products: LowEProduct[]; }

const LOW_E_DATABASE: LowEManufacturer[] = [
  { name: 'Cardinal', products: [
    { name: 'LoE-i89',  surfaces: [1, 4], notes: 'Hard coat — surface 1 (ext) or 4 (int)' },
    { name: 'LoE-180',  surfaces: [2, 3], notes: 'Single silver — balanced VT/SHGC' },
    { name: 'LoE-272',  surfaces: [2, 3], notes: 'Dual silver — high VT, balanced' },
    { name: 'LoE-340',  surfaces: [2, 3], notes: 'High solar control' },
    { name: 'LoE-366',  surfaces: [2, 3], notes: 'Triple silver — premium performance' },
  ]},
  { name: 'Vitro (PPG)', products: [
    { name: 'Solarban 60',    surfaces: [2], notes: 'Standard dual silver' },
    { name: 'Solarban 70XL',  surfaces: [2], notes: 'High VT dual silver' },
    { name: 'Solarban 72',    surfaces: [2], notes: 'Balanced VT and SHGC' },
    { name: 'Solarban 90',    surfaces: [2], notes: 'High solar control' },
    { name: 'Solarban R100',  surfaces: [2], notes: 'Triple silver — premium' },
    { name: 'Vistacool',      surfaces: [2], notes: 'Tinted low-e' },
  ]},
  { name: 'AGC', products: [
    { name: 'Stopray Vision-50', surfaces: [2], notes: 'Solar control, neutral' },
    { name: 'Stopray Vision-60', surfaces: [2], notes: 'High VT, low SHGC' },
    { name: 'Planibel LoE',      surfaces: [2], notes: 'General purpose' },
  ]},
  { name: 'Guardian', products: [
    { name: 'ClimaGuard Premium 2',  surfaces: [2], notes: 'Energy Star qualified' },
    { name: 'SunGuard SNX 62/27',    surfaces: [2], notes: 'High solar control' },
    { name: 'SunGuard HP Silver 40', surfaces: [2], notes: 'Neutral appearance' },
    { name: 'UltraClear',            surfaces: [2], notes: 'Low-iron base + LoE' },
  ]},
  { name: 'Pilkington', products: [
    { name: 'Optitherm S3',     surfaces: [3], notes: 'High perf — surface 3 only' },
    { name: 'Energy Advantage', surfaces: [2], notes: 'Standard energy performance' },
    { name: 'Optiwhite LoE',    surfaces: [2], notes: 'Low-iron ultra-clear base' },
  ]},
];

function isLamType(g: LiteGlassType) {
  return g === 'laminated' || g === 'lam-tempered' || g === 'lam-hs';
}

function liteTotalMM(lite: LiteSpec): number {
  if (isLamType(lite.glassType) && lite.ply1MM && lite.ply2MM) {
    const il = INTERLAYERS.find(x => x.value === (lite.interlayer || 'pvb-0.76'));
    return Number(lite.ply1MM) + (il?.mm || 0.76) + Number(lite.ply2MM);
  }
  return Number(lite.thicknessMM);
}

function calcIguThicknessMM(spec: GlazingSpec): number {
  const lmm = (l: LiteSpec | undefined) => l ? liteTotalMM(l) : 0;
  const spacer = (mm: SpacerWidthMM | undefined) => mm ? Number(mm) : 0;
  if (spec.build === 'single') return lmm(spec.lite1);
  if (spec.build === 'double') return lmm(spec.lite1) + spacer(spec.spacer1?.widthMM) + lmm(spec.lite2);
  return lmm(spec.lite1) + spacer(spec.spacer1?.widthMM) + lmm(spec.lite2) + spacer(spec.spacer2?.widthMM) + lmm(spec.lite3);
}

function mmToFrac(mm: number): string {
  const inches = mm / 25.4;
  return toFraction(Math.round(inches * 16) / 16);
}

// ─────────────────────────────────────────────
// EXPORT GENERATORS
// ─────────────────────────────────────────────
function lamConstruction(lite: LiteSpec): string {
  const il = INTERLAYERS.find(x => x.value === (lite.interlayer || 'pvb-0.76'));
  const ilMM = il?.mm || 0.76;
  const plyName = lite.glassType === 'lam-tempered' ? 'Temp' : lite.glassType === 'lam-hs' ? 'HS' : 'Ann';
  const intName = il ? il.label.split(' ')[0] : 'PVB';
  if (lite.ply1MM && lite.ply2MM) {
    return `${lite.ply1MM}mm ${plyName} + ${ilMM}mm ${intName} + ${lite.ply2MM}mm ${plyName}`;
  }
  const half = ((Number(lite.thicknessMM) - ilMM) / 2).toFixed(2);
  return `${half}mm ${plyName} + ${ilMM}mm ${intName} + ${half}mm ${plyName}`;
}

function liteSpecLabel(lite: LiteSpec): string {
  const thk = LITE_THICKNESS_MM.find(t => t.mm === lite.thicknessMM);
  const type = LITE_GLASS_TYPES.find(t => t.value === lite.glassType);
  const tint = lite.tint !== 'clear' ? ` ${lite.tint}` : '';
  const lowe = lite.hasLowE && lite.lowEProduct ? ` + ${lite.lowEProduct} @#${lite.lowESurface}` : '';
  const isLam = lite.glassType === 'laminated' || lite.glassType === 'lam-tempered' || lite.glassType === 'lam-hs';
  const lamNote = isLam ? ` [${lamConstruction(lite)}]` : '';
  return `${thk?.label || lite.thicknessMM}mm ${type?.label || ''}${tint}${lowe}${lamNote}`;
}

function glazingSpecLabel(spec: GlazingSpec): string {
  if (spec.build === 'single') return liteSpecLabel(spec.lite1);
  const spacer1 = spec.spacer1 ? `${spec.spacer1.widthMM}mm ${SPACER_TYPES.find(s => s.value === spec.spacer1!.type)?.label || spec.spacer1.type}` : '';
  const gas1 = GAS_FILLS.find(g => g.value === spec.gasFill1)?.label || '';
  if (spec.build === 'double') return `${liteSpecLabel(spec.lite1)} / ${spacer1} / ${gas1} / ${spec.lite2 ? liteSpecLabel(spec.lite2) : ''}`;
  const spacer2 = spec.spacer2 ? `${spec.spacer2.widthMM}mm ${SPACER_TYPES.find(s => s.value === spec.spacer2!.type)?.label || spec.spacer2.type}` : '';
  const gas2 = GAS_FILLS.find(g => g.value === spec.gasFill2)?.label || '';
  return `${liteSpecLabel(spec.lite1)} / ${spacer1} / ${gas1} / ${spec.lite2 ? liteSpecLabel(spec.lite2) : ''} / ${spacer2} / ${gas2} / ${spec.lite3 ? liteSpecLabel(spec.lite3) : ''}`;
}

function generateCSV(project: Project): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const header = ['#','Name','Location','Qty','Width (in)','Height (in)','Area (ft²)','Mode','IGU Build','Glazing Spec','IGU Total (mm)','IGU Total (in)'];
  const rows = project.units.map((u, i) => {
    const totalMM = calcIguThicknessMM(u.glazingSpec);
    return [
      i + 1, u.name, u.location, u.quantity,
      u.overallWidth, u.overallHeight,
      (u.overallWidth * u.overallHeight / 144 * u.quantity).toFixed(2),
      u.projectMode, u.glazingSpec.build,
      glazingSpecLabel(u.glazingSpec),
      totalMM, mmToFrac(totalMM),
    ].map(esc).join(',');
  });
  return [header.map(esc).join(','), ...rows].join('\r\n');
}

// ─────────────────────────────────────────────
// UNIT SVG RENDERER (for PDF quote — pure strings, no React)
// ─────────────────────────────────────────────
function renderUnitSVGString(unit: Unit): string {
  const MAX_W = 170, MAX_H = 145;
  const W = unit.overallWidth, H = unit.overallHeight;
  const isGlass = unit.projectMode === 'glass';
  const sc = Math.min(MAX_W / W, MAX_H / H);
  const svgW = Math.round(W * sc), svgH = Math.round(H * sc);
  const FR = isGlass ? 0 : Math.max(4, Math.round(FRAME_THICKNESS * sc));
  const MU = Math.max(2, Math.round(MULLION_THICKNESS * sc));
  const SA = Math.max(2, Math.round(SASH_PROFILE * sc));

  function opIndicator(type: WindowPaneType, x: number, y: number, w: number, h: number): string {
    const cx = x + w / 2, cy = y + h / 2;
    const as = Math.max(8, Math.min(w, h) * 0.28);
    const col = '#475569';
    switch (type) {
      case 'slide-l':
        return `<text x="${cx}" y="${cy+as*0.35}" text-anchor="middle" font-size="${as}" fill="${col}" font-family="Arial">←</text>`;
      case 'slide-r':
        return `<text x="${cx}" y="${cy+as*0.35}" text-anchor="middle" font-size="${as}" fill="${col}" font-family="Arial">→</text>`;
      case 'slide-u':
        return `<text x="${cx}" y="${cy+as*0.35}" text-anchor="middle" font-size="${as}" fill="${col}" font-family="Arial">↑</text>`;
      case 'slide-d':
        return `<text x="${cx}" y="${cy+as*0.35}" text-anchor="middle" font-size="${as}" fill="${col}" font-family="Arial">↓</text>`;
      case 'patio-xo': case 'patio-ox':
        return `<text x="${cx}" y="${cy+as*0.35}" text-anchor="middle" font-size="${as}" fill="${col}" font-family="Arial">↔</text>`;
      case 'patio-xox': case 'patio-oxxxo':
        return `<text x="${cx}" y="${cy+as*0.35}" text-anchor="middle" font-size="${as}" fill="${col}" font-family="Arial">↔</text>`;
      case 'double-hung':
        return `<text x="${cx}" y="${cy+as*0.35}" text-anchor="middle" font-size="${as}" fill="${col}" font-family="Arial">↕</text>`;
      case 'casement-l':
        return `<polyline points="${x+w-SA*1.5},${y+SA*1.5} ${x+SA*1.5},${cy} ${x+w-SA*1.5},${y+h-SA*1.5}" fill="none" stroke="${col}" stroke-width="1.2"/>`;
      case 'casement-r':
        return `<polyline points="${x+SA*1.5},${y+SA*1.5} ${x+w-SA*1.5},${cy} ${x+SA*1.5},${y+h-SA*1.5}" fill="none" stroke="${col}" stroke-width="1.2"/>`;
      case 'awning':
        return `<polyline points="${x+SA},${y+h*0.6} ${x+w/2},${y+SA*1.5} ${x+w-SA},${y+h*0.6}" fill="none" stroke="${col}" stroke-width="1.2"/>`;
      case 'hopper':
        return `<polyline points="${x+SA},${y+h*0.4} ${x+w/2},${y+h-SA*1.5} ${x+w-SA},${y+h*0.4}" fill="none" stroke="${col}" stroke-width="1.2"/>`;
      default: return '';
    }
  }

  function renderNode(node: TreeNode, x: number, y: number, w: number, h: number): string {
    if (node.type === 'split') {
      const [c1, c2] = node.children;
      if (node.direction === 'V') {
        const split = Math.round((w - MU) * node.ratio);
        return renderNode(c1, x, y, split, h)
          + `<rect x="${x+split}" y="${y}" width="${MU}" height="${h}" fill="#475569"/>`
          + renderNode(c2, x+split+MU, y, w-split-MU, h);
      } else {
        const split = Math.round((h - MU) * node.ratio);
        return renderNode(c1, x, y, w, split)
          + `<rect x="${x}" y="${y+split}" width="${w}" height="${MU}" fill="#475569"/>`
          + renderNode(c2, x, y+split+MU, w, h-split-MU);
      }
    }
    // PaneNode
    const pane = node as PaneNode;
    const gcol = isGlass ? (GLASS_FILL[pane.glassType || 'tempered'] || '#dbeafe') : '#e0f2fe';
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white" stroke="#1e293b" stroke-width="1.5"/>`;
    if (!isGlass) {
      s += `<rect x="${x+SA}" y="${y+SA}" width="${Math.max(0,w-SA*2)}" height="${Math.max(0,h-SA*2)}" fill="${gcol}" stroke="#94a3b8" stroke-width="0.75"/>`;
      s += opIndicator(pane.paneType, x, y, w, h);
    } else {
      s += `<rect x="${x+2}" y="${y+2}" width="${Math.max(0,w-4)}" height="${Math.max(0,h-4)}" fill="${gcol}" stroke="#34d399" stroke-width="1" stroke-dasharray="3 2"/>`;
      for (const c of (pane.cutouts || [])) {
        const ccx = x + c.x * sc, ccy = y + c.y * sc, r = (c.diameter / 2) * sc;
        s += `<circle cx="${ccx}" cy="${ccy}" r="${Math.max(1.5,r)}" fill="white" stroke="#64748b" stroke-width="1"/>`;
      }
    }
    return s;
  }

  let inner = '';
  if (!isGlass) {
    inner += `<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#475569" stroke="#1e293b" stroke-width="2"/>`;
    inner += renderNode(unit.tree, FR, FR, svgW - FR*2, svgH - FR*2);
  } else {
    inner += renderNode(unit.tree, 0, 0, svgW, svgH);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">${inner}</svg>`;
}

function generateQuoteHTML(project: Project): string {
  const date = new Date(project.date).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const totalUnits = project.units.reduce((s, u) => s + u.quantity, 0);
  const totalArea = project.units.reduce((s, u) => s + u.overallWidth * u.overallHeight / 144 * u.quantity, 0);

  // Logo: load from public folder if running in Electron, else use relative path
  const logoSrc = window.electronAPI
    ? `file://${window.location.pathname.replace(/\/[^/]+$/, '')}/ww1.png`.replace('app.asar', 'app.asar.unpacked')
    : './ww1.png';

  const rows = project.units.map((u, i) => {
    const totalMM = calcIguThicknessMM(u.glazingSpec);
    const area = (u.overallWidth * u.overallHeight / 144 * u.quantity).toFixed(2);
    const spec = glazingSpecLabel(u.glazingSpec);
    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    return `
      <tr style="background:${bg}">
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:600;color:#64748b">${i + 1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${u.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">${u.location || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${u.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-family:monospace;font-size:13px">${toFraction(u.overallWidth)} × ${toFraction(u.overallHeight)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${u.glazingSpec.build.toUpperCase()}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#334155">${spec}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-family:monospace;font-size:12px">${totalMM}mm<br><span style="color:#94a3b8;font-size:10px">${mmToFrac(totalMM)}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#64748b">${area} ft²</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #1e293b; background: white; }
  @page { size: Letter landscape; margin: 0.5in 0.6in; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 14px; border-bottom: 3px solid #1e4a8f; }
  .logo-block { display: flex; align-items: center; gap: 14px; }
  .logo-img { width: 72px; height: 72px; object-fit: contain; }
  .company { font-size: 18px; font-weight: 800; color: #1e4a8f; letter-spacing: -0.3px; line-height: 1.2; }
  .company-sub { font-size: 10px; color: #38bdf8; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; margin-top: 1px; }
  .contact-info { font-size: 10px; color: #475569; margin-top: 6px; line-height: 1.8; }
  .contact-info a { color: #1e4a8f; text-decoration: none; }
  .project-meta { text-align: right; }
  .project-name { font-size: 16px; font-weight: 700; color: #1e40af; }
  .meta-row { font-size: 11px; color: #64748b; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead tr { background: #1e293b; color: white; }
  thead th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap; }
  thead th:not(:first-child) { border-left: 1px solid #334155; }
  .totals-row { background: #f1f5f9; font-weight: 700; }
  .totals-row td { padding: 10px 12px; border-top: 2px solid #cbd5e1; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
  .badge { display: inline-block; padding: 2px 8px; background: #dbeafe; color: #1d4ed8; border-radius: 99px; font-size: 10px; font-weight: 600; }
</style>
</head><body>
  <div class="header">
    <div class="logo-block">
      <img class="logo-img" src="${logoSrc}" alt="Western Windows Logo" />
      <div>
        <div class="company">Western Windows Inc.</div>
        <div class="company-sub">Windows &amp; Skylights</div>
        <div class="contact-info">
          3-143 Riverside Drive, North Vancouver, B.C. V7H 1T6<br>
          Office: (604) 904-6580 &nbsp;|&nbsp; Cell: (778) 233-6580<br>
          <a href="mailto:info@westernwindows.ca">info@westernwindows.ca</a> &nbsp;|&nbsp; westernwindows.ca
        </div>
      </div>
    </div>
    <div class="project-meta">
      <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Glazing Order / Supplier Quote</div>
      <div class="project-name">${project.name}</div>
      ${project.customer ? `<div class="meta-row"><strong>Customer:</strong> ${project.customer}</div>` : ''}
      <div class="meta-row"><strong>Date:</strong> ${date}</div>
      <div class="meta-row" style="margin-top:6px">
        <span class="badge">${totalUnits} units</span>
        <span class="badge" style="margin-left:4px;background:#dcfce7;color:#15803d">${totalArea.toFixed(1)} ft² total</span>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th>Unit Name</th>
        <th>Location</th>
        <th style="width:40px;text-align:center">Qty</th>
        <th style="width:120px;text-align:center">Dimensions</th>
        <th style="width:60px;text-align:center">Build</th>
        <th>Glazing Specification</th>
        <th style="width:80px;text-align:center">IGU Total</th>
        <th style="width:70px;text-align:right">Area</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="totals-row">
        <td colspan="3" style="padding:10px 12px">TOTALS</td>
        <td style="padding:10px 12px;text-align:center;border-left:1px solid #e2e8f0">${totalUnits}</td>
        <td colspan="4" style="padding:10px 12px;border-left:1px solid #e2e8f0"></td>
        <td style="padding:10px 12px;text-align:right;border-left:1px solid #e2e8f0">${totalArea.toFixed(2)} ft²</td>
      </tr>
    </tfoot>
  </table>

  <!-- Unit Details -->
  <div style="page-break-before:auto;margin-top:28px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:12px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">Unit Details</div>
    ${project.units.map((u, i) => {
      const svgStr = renderUnitSVGString(u);
      const totalMM = calcIguThicknessMM(u.glazingSpec);
      const spec = u.glazingSpec;
      const b = spec.build;
      const liteRow = (lite: LiteSpec | undefined, label: string) => {
        if (!lite) return '';
        const type = LITE_GLASS_TYPES.find(t => t.value === lite.glassType)?.label || lite.glassType;
        const isLam = lite.glassType === 'laminated' || lite.glassType === 'lam-tempered' || lite.glassType === 'lam-hs';
        const construction = isLam ? ` &nbsp;<span style="color:#6366f1">[${lamConstruction(lite)}]</span>` : '';
        const tint = lite.tint !== 'clear' ? ` · ${lite.tint}` : '';
        const lowe = lite.hasLowE && lite.lowEProduct ? ` <span style="color:#059669">+ ${lite.lowEProduct} @Surf.${lite.lowESurface}</span>` : '';
        return `<tr><td style="color:#64748b;padding:3px 8px;white-space:nowrap;font-size:10px">${label}</td><td style="padding:3px 8px;font-size:10px">${lite.thicknessMM}mm ${type}${tint}${lowe}${construction}</td></tr>`;
      };
      const spacerRow = (spacer: SpacerSpec | undefined, gas: GasFill | undefined, label: string) => {
        if (!spacer) return '';
        const stype = SPACER_TYPES.find(s => s.value === spacer.type)?.label || spacer.type;
        const gasLabel = GAS_FILLS.find(g => g.value === gas)?.label || 'Air';
        return `<tr><td style="color:#64748b;padding:3px 8px;white-space:nowrap;font-size:10px">${label}</td><td style="padding:3px 8px;font-size:10px">${spacer.widthMM}mm ${stype} · ${gasLabel}</td></tr>`;
      };
      return `
      <div style="page-break-inside:avoid;display:flex;gap:20px;align-items:flex-start;padding:14px 16px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:10px;background:${i%2===0?'#ffffff':'#f8fafc'}">
        <div style="flex-shrink:0;text-align:center">
          ${svgStr}
          <div style="font-size:9px;color:#94a3b8;margin-top:4px;font-family:monospace">${toFraction(u.overallWidth)}" × ${toFraction(u.overallHeight)}"</div>
        </div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
            <div>
              <span style="font-size:13px;font-weight:700;color:#1e293b">#${i+1} &mdash; ${u.name}</span>
              ${u.location ? `<span style="font-size:11px;color:#64748b;margin-left:8px">${u.location}</span>` : ''}
              ${u.projectMode === 'window' ? `<span style="font-family:monospace;font-size:14px;font-weight:900;color:#2563eb;letter-spacing:2px;margin-left:10px">${deriveXOString(u.tree)}</span>` : ''}
            </div>
            <div style="font-size:10px;color:#64748b">Qty: <strong>${u.quantity}</strong> &nbsp;&nbsp; IGU: <strong>${totalMM.toFixed(2)}mm (${mmToFrac(totalMM)})</strong></div>
          </div>
          <table style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden">
            <thead><tr style="background:#f1f5f9"><th style="padding:4px 8px;font-size:10px;text-align:left;color:#64748b">Component</th><th style="padding:4px 8px;font-size:10px;text-align:left;color:#64748b">Specification</th></tr></thead>
            <tbody style="font-family:-apple-system,sans-serif">
              <tr><td style="color:#64748b;padding:3px 8px;font-size:10px">Build</td><td style="padding:3px 8px;font-size:10px;font-weight:600">${b.toUpperCase()} &mdash; ${b==='single'?'Monolithic':b==='double'?'Insulating (IGU)':'Triple IGU'}</td></tr>
              ${liteRow(spec.lite1, 'Lite 1 (Ext)')}
              ${spacerRow(spec.spacer1, spec.gasFill1, 'Spacer 1')}
              ${liteRow(spec.lite2, b==='triple'?'Lite 2 (Mid)':'Lite 2 (Int)')}
              ${b==='triple' ? spacerRow(spec.spacer2, spec.gasFill2, 'Spacer 2') : ''}
              ${b==='triple' ? liteRow(spec.lite3, 'Lite 3 (Int)') : ''}
            </tbody>
          </table>
          ${''/* unit notes not on Unit model */}
        </div>
      </div>`;
    }).join('')}
  </div>

  ${project.notes ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:20px"><strong style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b">Project Notes</strong><p style="margin-top:6px;color:#334155">${project.notes}</p></div>` : ''}

  <div class="footer">
    <span>Western Windows Inc. &nbsp;·&nbsp; (604) 904-6580 &nbsp;·&nbsp; info@westernwindows.ca &nbsp;·&nbsp; westernwindows.ca</span>
    <span>All dimensions in inches unless noted. Verify dimensions before ordering. &nbsp;·&nbsp; ${new Date().toLocaleString()}</span>
  </div>
</body></html>`;
}

// ─────────────────────────────────────────────
// TREE HELPERS
// ─────────────────────────────────────────────
function updateNode(node: TreeNode, id: string, updater: (n: TreeNode) => TreeNode): TreeNode {
  if (node.id === id) return updater({ ...node });
  if (node.type === 'split') return { ...node, children: node.children.map(c => updateNode(c, id, updater)) };
  return node;
}
function deleteNode(node: TreeNode, targetId: string): TreeNode | null {
  if (node.id === targetId) return null;
  if (node.type === 'split') {
    const children = node.children.map(c => deleteNode(c, targetId)).filter(Boolean) as TreeNode[];
    return children.length === 1 ? children[0] : { ...node, children };
  }
  return node;
}
function findNode(node: TreeNode, id: string): TreeNode | null {
  if (node.id === id) return node;
  if (node.type === 'split') for (const c of node.children) { const f = findNode(c, id); if (f) return f; }
  return null;
}

// Reads the pane tree left-to-right and builds the unit label string.
// fixed panes → 'O', any operable pane → 'X'
// Example: XO, OXO, XOX, etc.
function deriveXOString(node: TreeNode): string {
  if (node.type === 'pane') return (node as PaneNode).paneType === 'fixed' ? 'O' : 'X';
  // SplitNode: left child first (V = left/right, H = top/bottom)
  return node.children.map(deriveXOString).join('');
}

const makeInitialPane = (id = 'root'): PaneNode => ({
  id, type: 'pane', paneType: 'fixed',
  glassType: 'tempered', glassThickness: '1/2', edgeFinish: 'polished', cutouts: [],
});

const makeDefaultLite = (): LiteSpec => ({
  thicknessMM: '6', glassType: 'clear', tint: 'clear', hasLowE: false,
});

const makeDefaultGlazing = (): GlazingSpec => ({
  build: 'double',
  lite1: { ...makeDefaultLite(), hasLowE: true, lowEManufacturer: 'Cardinal', lowEProduct: 'LoE-272', lowESurface: 2 },
  spacer1: { type: 'aluminum', widthMM: '12' },
  gasFill1: 'argon-90',
  lite2: makeDefaultLite(),
});

const makeNewUnit = (): Unit => ({
  id: uuid(), name: 'Unit 1', location: '', quantity: 1,
  projectMode: 'window', overallWidth: 48, overallHeight: 48,
  tree: makeInitialPane(),
  glazingSpec: makeDefaultGlazing(),
});

const makeNewProject = (): Project => ({
  id: uuid(), name: 'New Project', customer: '', date: new Date().toISOString().split('T')[0],
  notes: '', units: [makeNewUnit()],
});

// ─────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────
export default function WindowBuilderApp() {
  const [project, setProject] = useState<Project | null>(null);
  const [view, setView] = useState<AppView>('project-manager');
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [projectFile, setProjectFile] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const activeUnit = useMemo(
    () => project?.units.find(u => u.id === activeUnitId) || null,
    [project?.units, activeUnitId]
  );

  const updateProject = (updater: (p: Project) => Project) => {
    setProject(prev => prev ? updater(prev) : prev);
    setIsDirty(true);
  };

  const openUnit = (unitId: string) => { setActiveUnitId(unitId); setView('unit-editor'); };

  const addUnit = () => {
    if (!project) return;
    const unit: Unit = { ...makeNewUnit(), name: `Unit ${project.units.length + 1}` };
    updateProject(p => ({ ...p, units: [...p.units, unit] }));
    openUnit(unit.id);
  };

  const duplicateUnit = (unitId: string) => {
    const src = project?.units.find(u => u.id === unitId);
    if (!src) return;
    const copy: Unit = { ...JSON.parse(JSON.stringify(src)), id: uuid(), name: src.name + ' (copy)' };
    updateProject(p => ({ ...p, units: [...p.units, copy] }));
  };

  const deleteUnit = (unitId: string) => {
    updateProject(p => ({ ...p, units: p.units.filter(u => u.id !== unitId) }));
  };

  const saveUnit = (unitId: string, updated: Partial<Unit>) => {
    updateProject(p => ({ ...p, units: p.units.map(u => u.id === unitId ? { ...u, ...updated } : u) }));
  };

  const handleSaveProject = async () => {
    if (!project) return;
    const content = JSON.stringify({ ...project, _v: 2 }, null, 2);
    if (window.electronAPI) {
      const res = await window.electronAPI.saveFile(content);
      if (res.success && res.filePath) { setProjectFile(res.filePath); setIsDirty(false); }
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      a.download = `${project.name}.fenconfig`; a.click();
      setIsDirty(false);
    }
  };

  const handleOpenProject = async () => {
    if (window.electronAPI) {
      const res = await window.electronAPI.openFile();
      if (res.success && res.content) {
        const loaded = JSON.parse(res.content);
        delete loaded._v;
        setProject(loaded as Project);
        setProjectFile(null);
        setIsDirty(false);
        setView('project-manager');
        setActiveUnitId(null);
      }
    }
  };

  const handleCreateProject = (name: string, customer: string) => {
    const p: Project = { ...makeNewProject(), name, customer };
    // Start with no units — user adds them manually
    p.units = [];
    setProject(p);
    setProjectFile(null);
    setIsDirty(true);
    setView('project-manager');
  };

  const handleCloseProject = () => {
    setProject(null);
    setProjectFile(null);
    setIsDirty(false);
    setView('project-manager');
    setActiveUnitId(null);
  };

  // Boot screen — no project loaded
  if (!project) {
    return (
      <StartScreen
        onCreateProject={handleCreateProject}
        onOpenProject={handleOpenProject}
      />
    );
  }

  if (view === 'unit-editor' && activeUnit) {
    return (
      <UnitEditor
        unit={activeUnit}
        projectName={project.name}
        onBack={() => setView('project-manager')}
        onSave={(updated) => saveUnit(activeUnit.id, updated)}
        onSaveProject={handleSaveProject}
        isDirty={isDirty}
      />
    );
  }

  return (
    <ProjectManager
      project={project}
      projectFile={projectFile}
      isDirty={isDirty}
      onOpenUnit={openUnit}
      onAddUnit={addUnit}
      onDuplicateUnit={duplicateUnit}
      onDeleteUnit={deleteUnit}
      onUpdateProject={updateProject}
      onSaveProject={handleSaveProject}
      onOpenProject={handleOpenProject}
      onCloseProject={handleCloseProject}
    />
  );
}

// ─────────────────────────────────────────────
// START SCREEN
// ─────────────────────────────────────────────
function StartScreen({
  onCreateProject, onOpenProject
}: {
  onCreateProject: (name: string, customer: string) => void;
  onOpenProject: () => void;
}) {
  const [mode, setMode] = useState<'home' | 'new'>('home');
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-8"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Logo */}
      <div className="flex items-center gap-3 mb-10">
        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/50">
          <Maximize2 className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Fenestration Pro</h1>
          <p className="text-sm text-neutral-400">Window & Glass Configurator</p>
        </div>
      </div>

      {mode === 'home' && (
        <div className="w-full max-w-md space-y-3">
          <button
            onClick={() => setMode('new')}
            className="w-full flex items-center gap-4 p-5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors shadow-lg shadow-blue-900/30 group">
            <div className="w-10 h-10 rounded-lg bg-blue-500 group-hover:bg-blue-400 flex items-center justify-center flex-shrink-0">
              <Plus className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-base">New Project</p>
              <p className="text-blue-200 text-sm">Start a fresh project for a job</p>
            </div>
          </button>

          <button
            onClick={onOpenProject}
            className="w-full flex items-center gap-4 p-5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl transition-colors border border-neutral-700 group">
            <div className="w-10 h-10 rounded-lg bg-neutral-700 group-hover:bg-neutral-600 flex items-center justify-center flex-shrink-0">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-base">Open Project</p>
              <p className="text-neutral-400 text-sm">Load a saved .fenconfig file</p>
            </div>
          </button>

          <p className="text-center text-xs text-neutral-600 pt-4">
            All windows and glass panels belong to a project.
          </p>
        </div>
      )}

      {mode === 'new' && (
        <div className="w-full max-w-md bg-neutral-800 rounded-2xl border border-neutral-700 p-6 shadow-2xl">
          <div className="flex items-center gap-2 mb-5">
            <button onClick={() => setMode('home')}
              className="text-neutral-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="text-white font-bold text-lg">New Project</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">Project Name *</label>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onCreateProject(name.trim(), customer.trim()); }}
                placeholder="e.g. Smith Residence, Unit 4B Reno"
                className="w-full p-3 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">Customer / Client</label>
              <input
                value={customer}
                onChange={e => setCustomer(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onCreateProject(name.trim(), customer.trim()); }}
                placeholder="Customer name (optional)"
                className="w-full p-3 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm" />
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button onClick={() => setMode('home')}
              className="flex-1 py-2.5 rounded-lg border border-neutral-600 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors text-sm font-medium">
              Cancel
            </button>
            <button
              onClick={() => { if (name.trim()) onCreateProject(name.trim(), customer.trim()); }}
              disabled={!name.trim()}
              className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> Create Project
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// PROJECT MANAGER VIEW
// ─────────────────────────────────────────────
function ProjectManager({
  project, projectFile, isDirty,
  onOpenUnit, onAddUnit, onDuplicateUnit, onDeleteUnit,
  onUpdateProject, onSaveProject, onOpenProject, onCloseProject
}: {
  project: Project; projectFile: string | null; isDirty: boolean;
  onOpenUnit: (id: string) => void; onAddUnit: () => void;
  onDuplicateUnit: (id: string) => void; onDeleteUnit: (id: string) => void;
  onUpdateProject: (updater: (p: Project) => Project) => void;
  onSaveProject: () => void; onOpenProject: () => void; onCloseProject: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(project.name);

  const totalArea = project.units.reduce((sum, u) => {
    return sum + u.overallWidth * u.overallHeight / 144 * u.quantity;
  }, 0);

  const handleExportPDF = async () => {
    const html = generateQuoteHTML(project);
    const name = `${project.name} - Quote.pdf`.replace(/[^a-zA-Z0-9\s\-_.]/g, '');
    if (window.electronAPI) {
      await window.electronAPI.exportPDF(html, name);
    } else {
      const blob = new Blob([html], { type: 'text/html' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = name.replace('.pdf', '.html'); a.click();
    }
  };

  const handleExportCSV = async () => {
    const csv = generateCSV(project);
    const name = `${project.name} - Quote.csv`.replace(/[^a-zA-Z0-9\s\-_.]/g, '');
    if (window.electronAPI) {
      await window.electronAPI.exportCSV(csv, name);
    } else {
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = name; a.click();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-50" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Top bar */}
      <div className="bg-neutral-900 text-white px-6 py-3 flex items-center gap-4 shadow-lg">
        <div className="flex items-center gap-2 flex-1">
          <Maximize2 className="w-5 h-5 text-blue-400" />
          <span className="text-sm font-semibold text-neutral-400">Fenestration Pro</span>
          <span className="text-neutral-600 mx-1">/</span>
          {editingName ? (
            <input
              autoFocus
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={() => { onUpdateProject(p => ({ ...p, name: nameVal })); setEditingName(false); }}
              onKeyDown={e => { if (e.key === 'Enter') { onUpdateProject(p => ({ ...p, name: nameVal })); setEditingName(false); } }}
              className="bg-neutral-800 text-white border-b border-blue-400 outline-none px-1 text-lg font-bold"
            />
          ) : (
            <button onClick={() => { setNameVal(project.name); setEditingName(true); }}
              className="text-lg font-bold text-white hover:text-blue-300 flex items-center gap-1.5">
              {project.name}
              {isDirty && <span className="text-amber-400 text-xs">●</span>}
              <Edit2 className="w-3.5 h-3.5 text-neutral-500" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {[
            { icon: <Plus className="w-4 h-4" />, label: 'New Project', fn: onCloseProject, style: 'bg-neutral-700 hover:bg-neutral-600' },
            { icon: <FolderOpen className="w-4 h-4" />, label: 'Open', fn: onOpenProject, style: 'bg-neutral-700 hover:bg-neutral-600' },
            { icon: <Save className="w-4 h-4" />, label: isDirty ? 'Save*' : 'Saved', fn: onSaveProject, style: isDirty ? 'bg-blue-600 hover:bg-blue-500' : 'bg-neutral-700 hover:bg-neutral-600' },
          ].map(({ icon, label, fn, style }) => (
            <button key={label} onClick={fn}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium text-white transition-colors ${style}`}>
              {icon} {label}
            </button>
          ))}
          <div className="w-px bg-neutral-700 mx-1" />
          <button onClick={handleExportPDF} disabled={project.units.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <FileText className="w-4 h-4" /> Export PDF
          </button>
          <button onClick={handleExportCSV} disabled={project.units.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium text-white bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left — Project metadata */}
        <div className="w-72 bg-white border-r border-neutral-200 p-5 space-y-4 overflow-y-auto flex-shrink-0">
          <div>
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Project Info</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-neutral-600">Customer</label>
                <input value={project.customer}
                  onChange={e => onUpdateProject(p => ({ ...p, customer: e.target.value }))}
                  placeholder="Customer name"
                  className="w-full p-2 border border-neutral-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-neutral-600">Date</label>
                <input type="date" value={project.date}
                  onChange={e => onUpdateProject(p => ({ ...p, date: e.target.value }))}
                  className="w-full p-2 border border-neutral-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-neutral-600">Notes</label>
                <textarea value={project.notes} rows={4}
                  onChange={e => onUpdateProject(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Site notes, special requirements..."
                  className="w-full p-2 border border-neutral-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
              </div>
            </div>
          </div>

          <hr className="border-neutral-100" />

          <div>
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Summary</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Total Units</span>
                <span className="font-semibold">{project.units.reduce((s, u) => s + u.quantity, 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Line Items</span>
                <span className="font-semibold">{project.units.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Est. Glass Area</span>
                <span className="font-semibold">{totalArea.toFixed(1)} ft²</span>
              </div>
            </div>
          </div>

          <hr className="border-neutral-100" />

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 leading-relaxed">
            <p className="font-semibold mb-1">💡 Quick Start</p>
            <p>Click any unit to edit it in the canvas. Add more units with the button below. Save the project to keep all units together in one file.</p>
          </div>
        </div>

        {/* Right — Unit grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-neutral-800">
              Units <span className="text-neutral-400 font-normal text-sm ml-1">({project.units.length})</span>
            </h2>
            <button onClick={onAddUnit}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold shadow-sm">
              <Plus className="w-4 h-4" /> Add Unit
            </button>
          </div>

          {project.units.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-neutral-400">
              <Maximize2 className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-lg font-medium">No units yet</p>
              <p className="text-sm mt-1">Click "Add Unit" to start designing</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {project.units.map((unit, idx) => (
                <UnitCard
                  key={unit.id}
                  unit={unit}
                  index={idx}
                  onOpen={() => onOpenUnit(unit.id)}
                  onDuplicate={() => onDuplicateUnit(unit.id)}
                  onDelete={() => onDeleteUnit(unit.id)}
                  onUpdate={(updated) => onUpdateProject(p => ({
                    ...p, units: p.units.map(u => u.id === unit.id ? { ...u, ...updated } : u)
                  }))}
                  canDelete={project.units.length > 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// UNIT CARD
// ─────────────────────────────────────────────
function UnitCard({ unit, index, onOpen, onDuplicate, onDelete, onUpdate, canDelete }: {
  unit: Unit; index: number;
  onOpen: () => void; onDuplicate: () => void; onDelete: () => void;
  onUpdate: (u: Partial<Unit>) => void; canDelete: boolean;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(unit.name);
  const typeLabel = unit.projectMode === 'glass' ? 'Glass Panel' : 'Window/Door';
  const area = (unit.overallWidth * unit.overallHeight / 144 * unit.quantity).toFixed(1);

  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
      {/* Preview */}
      <div className="bg-slate-100 h-36 flex items-center justify-center cursor-pointer relative"
        onClick={onOpen}>
        <MiniPreview unit={unit} />
        <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/5 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="bg-white rounded-full px-3 py-1 text-xs font-semibold text-blue-600 shadow">Edit</div>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 mr-2">
            {editingName ? (
              <input autoFocus value={nameVal}
                onChange={e => setNameVal(e.target.value)}
                onBlur={() => { onUpdate({ name: nameVal }); setEditingName(false); }}
                onKeyDown={e => { if (e.key === 'Enter') { onUpdate({ name: nameVal }); setEditingName(false); } }}
                className="w-full border-b border-blue-400 outline-none text-sm font-bold" />
            ) : (
              <button onClick={() => { setNameVal(unit.name); setEditingName(true); }}
                className="text-sm font-bold text-neutral-800 hover:text-blue-600 flex items-center gap-1">
                {unit.name} <Edit2 className="w-3 h-3 text-neutral-400" />
              </button>
            )}
            <p className="text-xs text-neutral-400 mt-0.5">{typeLabel}</p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${unit.projectMode === 'glass' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
            {unit.projectMode === 'glass' ? 'GLASS' : 'WINDOW'}
          </span>
        </div>

        <div className="text-sm font-semibold text-neutral-800 mb-2">
          {toFraction(unit.overallWidth)} × {toFraction(unit.overallHeight)}
        </div>

        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="block text-[10px] text-neutral-400 mb-0.5">Location</label>
            <input value={unit.location} onChange={e => onUpdate({ location: e.target.value })}
              placeholder="e.g. Master Bath"
              className="w-full border-b border-neutral-200 focus:border-blue-400 outline-none text-xs py-0.5" />
          </div>
          <div className="w-14">
            <label className="block text-[10px] text-neutral-400 mb-0.5">Qty</label>
            <input type="number" min={1} value={unit.quantity} onChange={e => onUpdate({ quantity: Number(e.target.value) })}
              className="w-full border-b border-neutral-200 focus:border-blue-400 outline-none text-xs py-0.5 text-center" />
          </div>
        </div>

        <div className="text-[11px] text-neutral-400 mb-3">{area} ft² total</div>

        <div className="flex gap-1 pt-2 border-t border-neutral-100">
          <button onClick={onOpen}
            className="flex-1 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 transition-colors">
            Edit
          </button>
          <button onClick={onDuplicate} title="Duplicate"
            className="px-2 py-1.5 bg-neutral-100 text-neutral-600 rounded text-xs hover:bg-neutral-200 transition-colors">
            <Copy className="w-3.5 h-3.5" />
          </button>
          {canDelete && (
            <button onClick={onDelete} title="Delete"
              className="px-2 py-1.5 bg-red-50 text-red-500 rounded text-xs hover:bg-red-100 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MINI PREVIEW SVG
// ─────────────────────────────────────────────
function MiniPreview({ unit }: { unit: Unit }) {
  const maxW = 180, maxH = 120;
  const ratio = Math.min(maxW / unit.overallWidth, maxH / unit.overallHeight);
  const scale = ratio * 0.8;
  const svgW = unit.overallWidth * scale + 20;
  const svgH = unit.overallHeight * scale + 20;

  const renderMini = (node: TreeNode, x: number, y: number, w: number, h: number): React.ReactNode => {
    if (node.type === 'pane') {
      return (
        <g key={node.id} transform={`translate(${x},${y})`}>
          <rect x={0} y={0} width={w} height={h} fill="#f0f9ff" stroke="#94a3b8" strokeWidth={1} />
          <rect x={2} y={2} width={Math.max(0, w - 4)} height={Math.max(0, h - 4)} fill="#e0f2fe" stroke="#cbd5e1" strokeWidth={0.5} />
        </g>
      );
    }
    if (node.type === 'split') {
      const isV = node.direction === 'V';
      const mull = 1.5;
      let w1: number, h1: number, w2: number, h2: number, x2: number, y2: number;
      if (isV) { const avW = w - mull; w1 = avW * node.ratio; h1 = h; w2 = avW * (1 - node.ratio); h2 = h; x2 = x + w1 + mull; y2 = y; }
      else { const avH = h - mull; w1 = w; h1 = avH * node.ratio; w2 = w; h2 = avH * (1 - node.ratio); x2 = x; y2 = y + h1 + mull; }
      return (
        <g key={node.id}>
          {renderMini(node.children[0], x, y, w1, h1)}
          {renderMini(node.children[1], x2, y2, w2, h2)}
          <rect x={isV ? x + w1 : x} y={isV ? y : y + h1} width={isV ? mull : w} height={isV ? h : mull} fill="#94a3b8" />
        </g>
      );
    }
  };

  return (
    <svg width={svgW} height={svgH}>
      <g transform="translate(10,10)">
        <rect x={0} y={0} width={unit.overallWidth * scale} height={unit.overallHeight * scale} fill="#f8fafc" stroke="#334155" strokeWidth={2} />
        {renderMini(unit.tree, 2, 2, unit.overallWidth * scale - 4, unit.overallHeight * scale - 4)}
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────
// UNIT EDITOR VIEW
// ─────────────────────────────────────────────
function UnitEditor({ unit, projectName, onBack, onSave, onSaveProject, isDirty }: {
  unit: Unit; projectName: string;
  onBack: () => void; onSave: (updated: Partial<Unit>) => void;
  onSaveProject: () => void; isDirty: boolean;
}) {
  const [editorState, setEditorState] = useState<EditorState>({
    tree: unit.tree,
    overallWidth: unit.overallWidth,
    overallHeight: unit.overallHeight,
    projectMode: unit.projectMode,
  });
  const [history, setHistory] = useState<EditorState[]>([editorState]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string>('root');
  const [dragState, setDragState] = useState<any>(null);
  const [snapIndicator, setSnapIndicator] = useState<number | null>(null);
  const [scale, setScale] = useState(10);
  const [glazingSpec, setGlazingSpec] = useState<GlazingSpec>(unit.glazingSpec || makeDefaultGlazing());
  const [cutoutMode, setCutoutMode] = useState(false);
  const [cutoutDiameter, setCutoutDiameter] = useState(1.25);
  const [cutoutBlocked, setCutoutBlocked] = useState(false);
  const [sidebarZoom, setSidebarZoom] = useState<number>(() => parseFloat(localStorage.getItem('wp-sidebar-zoom') || '1'));
  const [leftW, setLeftW] = useState<number>(() => parseInt(localStorage.getItem('wp-left-w') || '288'));
  const [rightW, setRightW] = useState<number>(() => parseInt(localStorage.getItem('wp-right-w') || '256'));
  const [dimEditActive, setDimEditActive] = useState(false);
  const [dimWInput, setDimWInput] = useState('');
  const [dimHInput, setDimHInput] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);

  const { tree, overallWidth, overallHeight, projectMode } = editorState;

  // Sync back to project whenever state changes
  useEffect(() => {
    onSave({ tree, overallWidth, overallHeight, projectMode, glazingSpec });
  }, [editorState, glazingSpec]);

  const pushState = useCallback((next: EditorState) => {
    setHistory(h => [...h.slice(0, historyIdx + 1), next]);
    setHistoryIdx(i => i + 1);
    setEditorState(next);
  }, [historyIdx]);

  const undo = useCallback(() => {
    if (historyIdx > 0) { setEditorState(history[historyIdx - 1]); setHistoryIdx(i => i - 1); }
  }, [history, historyIdx]);
  const redo = useCallback(() => {
    if (historyIdx < history.length - 1) { setEditorState(history[historyIdx + 1]); setHistoryIdx(i => i + 1); }
  }, [history, historyIdx]);

  // Persist sidebar prefs
  useEffect(() => { localStorage.setItem('wp-sidebar-zoom', String(sidebarZoom)); }, [sidebarZoom]);
  useEffect(() => { localStorage.setItem('wp-left-w', String(leftW)); }, [leftW]);
  useEffect(() => { localStorage.setItem('wp-right-w', String(rightW)); }, [rightW]);

  const startSidebarDrag = useCallback((e: React.MouseEvent, side: 'left' | 'right') => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === 'left' ? leftW : rightW;
    const onMove = (me: MouseEvent) => {
      const dx = me.clientX - startX;
      const nw = Math.max(180, Math.min(520, startW + (side === 'left' ? dx : -dx)));
      if (side === 'left') setLeftW(nw); else setRightW(nw);
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [leftW, rightW]);

  const openDimEdit = () => {
    setDimWInput(String(overallWidth));
    setDimHInput(String(overallHeight));
    setDimEditActive(true);
  };
  const confirmDimEdit = () => {
    const w = parseFloat(dimWInput), h = parseFloat(dimHInput);
    if (w > 0 && h > 0) pushState({ ...editorState, overallWidth: w, overallHeight: h });
    setDimEditActive(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); onSaveProject(); return; }
      if (e.key === 'v') handleSplit('V');
      if (e.key === 'h') handleSplit('H');
      if (e.key === 'Delete' || e.key === 'Backspace') handleDelete();
      if (e.key === 'Escape') { setSelectedId('root'); setCutoutMode(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, selectedId, editorState]);

  const handleSplit = (dir: 'V' | 'H') => {
    if (!selectedId) return;
    const newTree = updateNode(tree, selectedId, n => {
      if (n.type !== 'pane') return n;
      return {
        id: n.id, type: 'split', direction: dir, ratio: 0.5,
        children: [
          { ...n, id: uuid() } as PaneNode,
          { id: uuid(), type: 'pane', paneType: 'fixed', glassType: (n as PaneNode).glassType, glassThickness: (n as PaneNode).glassThickness, edgeFinish: (n as PaneNode).edgeFinish, cutouts: [] } as PaneNode,
        ],
      } as SplitNode;
    });
    pushState({ ...editorState, tree: newTree });
  };

  // ─── SLIDING PRESETS ──────────────────────────────────────────────────────
  // Rebuilds the selected pane as a properly-split sliding unit.
  // X = operable, O = fixed.  L-side X slides right, R-side X slides left.
  const handleSlidingPreset = (config: 'xo' | 'ox' | 'xox' | 'oxo' | 'oxxxo') => {
    const base = selectedNode?.type === 'pane'
      ? { glassType: (selectedNode as PaneNode).glassType, glassThickness: (selectedNode as PaneNode).glassThickness, edgeFinish: (selectedNode as PaneNode).edgeFinish, cutouts: [] as Cutout[] }
      : { glassType: 'clear' as GlassType, glassThickness: '1/4' as GlassThickness, edgeFinish: 'seamed' as EdgeFinish, cutouts: [] as Cutout[] };

    const pane = (type: WindowPaneType): PaneNode => ({ id: uuid(), type: 'pane', paneType: type, ...base });
    const vsplit = (ratio: number, left: TreeNode, right: TreeNode): SplitNode =>
      ({ id: uuid(), type: 'split', direction: 'V', ratio, children: [left, right] });

    const configs: Record<string, TreeNode> = {
      xo:    vsplit(0.5,   pane('slide-r'), pane('fixed')),
      ox:    vsplit(0.5,   pane('fixed'),   pane('slide-l')),
      xox:   vsplit(0.333, pane('slide-r'), vsplit(0.5, pane('fixed'),   pane('slide-l'))),
      oxo:   vsplit(0.333, pane('fixed'),   vsplit(0.5, pane('slide-r'), pane('fixed'))),
      oxxxo: vsplit(0.2,   pane('fixed'),   vsplit(0.25, pane('slide-r'),
               vsplit(0.333, pane('slide-r'), vsplit(0.5, pane('slide-l'), pane('fixed'))))),
    };

    const newSubTree = configs[config];
    let newTree: TreeNode;
    if (selectedId === 'root') {
      newTree = { ...newSubTree, id: 'root' };
    } else {
      newTree = updateNode(tree, selectedId, () => newSubTree);
    }
    pushState({ ...editorState, tree: newTree });
    setSelectedId('root');
  };

  const handleDelete = () => {
    if (selectedId === 'root') { pushState({ ...editorState, tree: makeInitialPane() }); return; }
    const newTree = deleteNode(tree, selectedId) || makeInitialPane();
    pushState({ ...editorState, tree: newTree });
    setSelectedId('root');
  };

  const updateProp = (prop: string, val: any) => {
    pushState({ ...editorState, tree: updateNode(tree, selectedId, n => ({ ...n, [prop]: val })) });
  };

  const handleExportSVG = async () => {
    if (!svgRef.current) return;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svgRef.current)}`;
    if (window.electronAPI) await window.electronAPI.exportSVG(svg);
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); a.download = `${unit.name}.svg`; a.click(); }
  };

  const handlePrint = () => window.electronAPI ? window.electronAPI.print() : window.print();

  // Mullion drag
  const onDragStart = (e: React.MouseEvent, splitId: string, startRatio: number, boundsW: number, boundsH: number, dir: 'V' | 'H') => {
    e.stopPropagation(); e.preventDefault();
    setDragState({ splitId, startX: e.clientX, startY: e.clientY, startRatio, boundsW, boundsH, dir });
  };

  useEffect(() => {
    if (!dragState) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
      const newTree = updateNode(tree, dragState.splitId, n => {
        const delta = dragState.dir === 'V'
          ? (dx / scale) / (dragState.boundsW - MULLION_THICKNESS)
          : (dy / scale) / (dragState.boundsH - MULLION_THICKNESS);
        let raw = Math.max(0.1, Math.min(0.9, dragState.startRatio + delta));
        const snap = SNAP_POINTS.find(p => Math.abs(raw - p) < SNAP_ZONE);
        if (snap !== undefined) { raw = snap; setSnapIndicator(snap); } else setSnapIndicator(null);
        return { ...n, ratio: raw };
      });
      setEditorState(prev => ({ ...prev, tree: newTree }));
    };
    const onUp = () => {
      setHistory(h => [...h.slice(0, historyIdx + 1), editorState]);
      setHistoryIdx(i => i + 1);
      setDragState(null); setSnapIndicator(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragState, scale, tree, historyIdx, editorState]);

  // SVG Renderer
  const panesList: (PaneNode & { x: number; y: number; w: number; h: number })[] = [];

  // Tempered glass cutout exclusion zone (5× glass thickness in inches)
  const glassMM = parseInt(glazingSpec.lite1.thicknessMM || '6');
  const minEdgeIn = (glassMM * 5) / 25.4;

  const handlePlaceCutout = (e: React.MouseEvent, nodeId: string, nodeX: number, nodeY: number, paneWpx: number, paneHpx: number) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const cx = (svgPt.x - (px + innerOX + nodeX)) / scale;
    const cy = (svgPt.y - (py + innerOY + nodeY)) / scale;
    const paneWin = paneWpx / scale;
    const paneHin = paneHpx / scale;
    const r = cutoutDiameter / 2;
    const isTempered = glazingSpec.lite1.glassType === 'tempered';

    // Block if rim would enter exclusion zone
    const tooClose = isTempered && (
      cx - r < minEdgeIn || cy - r < minEdgeIn ||
      paneWin - (cx + r) < minEdgeIn || paneHin - (cy + r) < minEdgeIn
    );
    if (tooClose) {
      setCutoutBlocked(true);
      setTimeout(() => setCutoutBlocked(false), 800);
      return;
    }

    const pane = findNode(tree, nodeId) as PaneNode;
    const newCutouts: Cutout[] = [{ id: uuid(), x: cx, y: cy, diameter: cutoutDiameter }];

    // Auto-mirror L↔R if enabled
    if (pane?.mirrorCutouts) {
      const mx = paneWin - cx;
      const noOverlap = Math.abs(mx - cx) >= cutoutDiameter;
      const inBounds = mx - r >= 0 && mx + r <= paneWin;
      const mirrorEdgeOk = !isTempered || (
        mx - r >= minEdgeIn && paneWin - (mx + r) >= minEdgeIn
      );
      if (noOverlap && inBounds && mirrorEdgeOk) {
        newCutouts.push({ id: uuid(), x: mx, y: cy, diameter: cutoutDiameter, mirrored: true });
      }
    }

    const newTree = updateNode(tree, nodeId, n => ({
      ...n, cutouts: [...((n as PaneNode).cutouts || []), ...newCutouts]
    }));
    pushState({ ...editorState, tree: newTree });
  };

  const renderNode = (node: TreeNode, x: number, y: number, w: number, h: number): React.ReactNode => {
    const sel = selectedId === node.id;
    const isGlass = projectMode === 'glass';

    if (node.type === 'pane') {
      panesList.push({ ...node, x, y, w, h });
      const wIn = w / scale, hIn = h / scale;
      const fontSize = Math.max(9, Math.min(13, w / 8));
      const glassColor = isGlass ? (GLASS_FILL[node.glassType || 'tempered']) : '#f0f9ff';

      return (
        <g key={node.id} transform={`translate(${x},${y})`}
          onClick={e => {
            e.stopPropagation();
            if (cutoutMode && isGlass) { handlePlaceCutout(e, node.id, x, y, w, h); return; }
            setSelectedId(node.id);
          }}
          style={{ cursor: cutoutMode && isGlass ? 'crosshair' : 'pointer' }}>
          <rect x={0} y={0} width={w} height={h}
            fill={sel ? '#dbeafe' : '#f8fafc'}
            stroke={sel ? '#3b82f6' : '#1e293b'} strokeWidth={sel ? 3 : 1.5} />
          {!isGlass && (
            <rect x={SASH_PROFILE} y={SASH_PROFILE}
              width={Math.max(0, w - SASH_PROFILE * 2)} height={Math.max(0, h - SASH_PROFILE * 2)}
              fill={glassColor} stroke="#9ca3af" strokeWidth={1} />
          )}
          {isGlass && (
            <rect x={4} y={4} width={Math.max(0, w - 8)} height={Math.max(0, h - 8)}
              fill={glassColor} stroke="#6ee7b7" strokeWidth={1.5} strokeDasharray="6 3" />
          )}

          {/* Tempered glass exclusion zone overlay */}
          {isGlass && (node.glassType === 'tempered' || glazingSpec.lite1.glassType === 'tempered') && (() => {
            const margin = minEdgeIn * scale;
            return (
              <>
                {/* Shaded exclusion zone — 4 edges */}
                <rect x={0} y={0} width={w} height={margin} fill="#fca5a5" opacity={0.25} />
                <rect x={0} y={h - margin} width={w} height={margin} fill="#fca5a5" opacity={0.25} />
                <rect x={0} y={margin} width={margin} height={h - margin * 2} fill="#fca5a5" opacity={0.25} />
                <rect x={w - margin} y={margin} width={margin} height={h - margin * 2} fill="#fca5a5" opacity={0.25} />
                {/* Dashed safe-zone border */}
                <rect x={margin} y={margin} width={Math.max(0, w - margin * 2)} height={Math.max(0, h - margin * 2)}
                  fill="none" stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
              </>
            );
          })()}

          {/* Cutout circles */}
          {isGlass && (node.cutouts || []).map((c: Cutout) => {
            const ccx = c.x * scale, ccy = c.y * scale;
            const r = (c.diameter / 2) * scale;
            const margin = minEdgeIn * scale;
            const isTempered = node.glassType === 'tempered' || glazingSpec.lite1.glassType === 'tempered';
            const violation = isTempered && (
              ccx - r < margin || ccy - r < margin ||
              w - (ccx + r) < margin || h - (ccy + r) < margin
            );
            const stroke = violation ? '#dc2626' : c.mirrored ? '#3b82f6' : '#10b981';
            const fill = violation ? '#fee2e2' : c.mirrored ? '#dbeafe' : '#d1fae5';
            const dashArray = c.mirrored ? '3 2' : undefined;
            return (
              <g key={c.id} style={{ pointerEvents: 'none' }}>
                <circle cx={ccx} cy={ccy} r={r} fill={fill} stroke={stroke} strokeWidth={1.5}
                  strokeDasharray={dashArray} opacity={0.85} />
                <line x1={ccx - r * 0.6} y1={ccy} x2={ccx + r * 0.6} y2={ccy} stroke={stroke} strokeWidth={0.8} />
                <line x1={ccx} y1={ccy - r * 0.6} x2={ccx} y2={ccy + r * 0.6} stroke={stroke} strokeWidth={0.8} />
                {violation && (
                  <text x={ccx} y={ccy - r - 3} textAnchor="middle" fontSize={8} fill="#dc2626" fontWeight="700">!</text>
                )}
                {c.mirrored && !violation && (
                  <text x={ccx} y={ccy - r - 3} textAnchor="middle" fontSize={7} fill="#3b82f6" fontWeight="700">M</text>
                )}
              </g>
            );
          })}

          {!isGlass && <PaneIndicators type={node.paneType} w={w} h={h} />}

          {/* X / O badge on window panes */}
          {!isGlass && w > 24 && h > 20 && (() => {
            const isX = node.paneType !== 'fixed';
            return (
              <text x={w - 8} y={h - 6} textAnchor="middle" fontSize={Math.max(8, Math.min(13, w / 6))}
                fontWeight="900" fill={isX ? '#2563eb' : '#64748b'} opacity={0.55}
                style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {isX ? 'X' : 'O'}
              </text>
            );
          })()}

          {/* Dimension label — top quarter */}
          {w > 50 && h > 35 && (
            <>
              <rect x={w / 2 - fontSize * 2.5} y={h * 0.15 - fontSize * 0.7} width={fontSize * 5} height={fontSize * 1.4} fill="white" opacity={0.8} rx={2} />
              <text x={w / 2} y={h * 0.15 + fontSize * 0.4} textAnchor="middle"
                fontSize={fontSize} fontWeight="600"
                fill={sel ? '#1d4ed8' : '#334155'}
                style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {toFraction(wIn)} × {toFraction(hIn)}
              </text>
            </>
          )}

          {/* Glass spec label — bottom quarter */}
          {isGlass && node.glassType && w > 80 && h > 55 && (
            <text x={w / 2} y={h * 0.85} textAnchor="middle"
              fontSize={Math.max(7, fontSize * 0.75)} fill="#059669"
              style={{ pointerEvents: 'none', userSelect: 'none' }}>
              {glazingSpec.lite1.thicknessMM}mm · {LITE_GLASS_TYPES.find(g => g.value === glazingSpec.lite1.glassType)?.label}
            </text>
          )}
          <rect x={0} y={0} width={w} height={h} fill="transparent" />
        </g>
      );
    }

    if (node.type === 'split') {
      const isV = node.direction === 'V';
      const mullPx = MULLION_THICKNESS;
      let w1: number, h1: number, w2: number, h2: number, x2: number, y2: number;
      if (isV) { const avW = w - mullPx; w1 = avW * node.ratio; h1 = h; w2 = avW * (1 - node.ratio); h2 = h; x2 = x + w1 + mullPx; y2 = y; }
      else { const avH = h - mullPx; w1 = w; h1 = avH * node.ratio; w2 = w; h2 = avH * (1 - node.ratio); x2 = x; y2 = y + h1 + mullPx; }
      const mX = isV ? x + w1 : x, mY = isV ? y : y + h1;
      const mW = isV ? mullPx : w, mH = isV ? h : mullPx;
      const isSnapped = snapIndicator !== null && Math.abs((isV ? w1 / w : h1 / h) - snapIndicator) < 0.01;

      return (
        <g key={node.id} onClick={e => { e.stopPropagation(); setSelectedId(node.id); }}>
          {sel && <rect x={x} y={y} width={w} height={h} fill="#bfdbfe" opacity={0.3} />}
          {renderNode(node.children[0], x, y, w1, h1)}
          {renderNode(node.children[1], x2, y2, w2, h2)}
          <rect x={mX} y={mY} width={mW} height={mH}
            fill={isSnapped ? '#3b82f6' : '#d1d5db'}
            stroke={isSnapped ? '#1d4ed8' : '#374151'} strokeWidth={1} />
          <rect
            x={isV ? mX - 5 : mX} y={isV ? mY : mY - 5}
            width={isV ? mW + 10 : mW} height={isV ? mH : mH + 10}
            fill="transparent" style={{ cursor: isV ? 'col-resize' : 'row-resize' }}
            onMouseDown={e => onDragStart(e, node.id, node.ratio, w / scale, h / scale, node.direction)}
          />
          {isSnapped && (
            <text x={isV ? mX + mullPx / 2 : x + w / 2} y={isV ? y + h / 2 : mY + mullPx / 2}
              textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="white" fontWeight="bold"
              style={{ pointerEvents: 'none' }}>⊙</text>
          )}
        </g>
      );
    }
  };

  const selectedNode = useMemo(() => findNode(tree, selectedId), [tree, selectedId]);
  const px = 80, py = 80;
  const svgW = overallWidth * scale + px * 2;
  const svgH = overallHeight * scale + py * 2;
  const innerW = projectMode === 'glass' ? overallWidth * scale : (overallWidth - FRAME_THICKNESS * 2) * scale;
  const innerH = projectMode === 'glass' ? overallHeight * scale : (overallHeight - FRAME_THICKNESS * 2) * scale;
  const innerOX = projectMode === 'glass' ? 0 : FRAME_THICKNESS * scale;
  const innerOY = projectMode === 'glass' ? 0 : FRAME_THICKNESS * scale;

  return (
    <div className="flex flex-col h-screen" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Breadcrumb bar */}
      <div className="bg-neutral-900 text-white px-4 py-2 flex items-center gap-3 text-sm border-b border-neutral-800">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-neutral-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> {projectName}
        </button>
        <span className="text-neutral-600">/</span>
        <span className="text-white font-semibold">{unit.name}</span>
        {isDirty && <span className="text-amber-400 text-xs ml-1">● unsaved</span>}
        <div className="flex-1" />
        <div className="flex gap-1">
          {[
            { icon: <Save className="w-3.5 h-3.5" />, label: 'Save Project', fn: onSaveProject, hot: 'Ctrl+S' },
            { icon: <Download className="w-3.5 h-3.5" />, label: 'SVG', fn: handleExportSVG, hot: '' },
            { icon: <Printer className="w-3.5 h-3.5" />, label: 'Print', fn: handlePrint, hot: '' },
          ].map(({ icon, label, fn }) => (
            <button key={label} onClick={fn}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors text-xs">
              {icon} {label}
            </button>
          ))}
          <div className="w-px bg-neutral-700 mx-1" />
          <button onClick={() => setSidebarZoom(z => parseFloat(Math.min(1.5, z + 0.1).toFixed(1)))}
            title="Increase sidebar text size" className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors text-xs font-bold">A+</button>
          <button onClick={() => setSidebarZoom(z => parseFloat(Math.max(0.75, z - 0.1).toFixed(1)))}
            title="Decrease sidebar text size" className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors text-xs font-bold">A−</button>
          <div className="w-px bg-neutral-700 mx-1" />
          <button onClick={undo} disabled={historyIdx === 0} title="Ctrl+Z"
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors disabled:opacity-30">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={redo} disabled={historyIdx >= history.length - 1} title="Ctrl+Y"
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors disabled:opacity-30">
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT SIDEBAR */}
        <div style={{ width: leftW, minWidth: 180, maxWidth: 520, zoom: sidebarZoom, flexShrink: 0 }}
          className="bg-white border-r border-neutral-200 flex flex-col z-10 overflow-y-auto">
          <div className="p-4 space-y-4">

            {/* Mode */}
            <div>
              <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Mode</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['window', 'glass'] as ProjectMode[]).map(m => (
                  <button key={m} onClick={() => pushState({ ...editorState, projectMode: m })}
                    className={`py-1.5 rounded text-xs font-semibold border transition-colors flex items-center justify-center gap-1
                      ${editorState.projectMode === m
                        ? m === 'window' ? 'bg-blue-600 text-white border-blue-600' : 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50'}`}>
                    {m === 'window' ? <Maximize2 className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                    {m === 'window' ? 'Window' : 'Glass Panel'}
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-neutral-100" />

            {/* Dimensions */}
            <div>
              <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5" /> Size
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-neutral-600">Width (in)</label>
                  <input type="number" value={overallWidth}
                    onChange={e => pushState({ ...editorState, overallWidth: Number(e.target.value) })}
                    className="w-full p-2 border border-neutral-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-neutral-600">Height (in)</label>
                  <input type="number" value={overallHeight}
                    onChange={e => pushState({ ...editorState, overallHeight: Number(e.target.value) })}
                    className="w-full p-2 border border-neutral-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                </div>
              </div>
              {projectMode === 'window' && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 flex justify-between">
                  <span className="font-semibold">R.O.</span>
                  <span>{toFraction(overallWidth + 2)} × {toFraction(overallHeight + 2)}</span>
                </div>
              )}
            </div>

            <hr className="border-neutral-100" />

            {/* Selected pane controls */}
            <div>
              <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <MousePointer2 className="w-3.5 h-3.5" /> Selected
              </h2>

              {selectedNode?.type === 'pane' && (
                <div className="space-y-3">
                  <div className="p-2.5 bg-neutral-50 rounded-lg border border-neutral-200">
                    <label className="block text-xs font-semibold mb-2 text-neutral-600">Split Pane</label>
                    <div className="flex gap-1.5">
                      <button onClick={() => handleSplit('V')}
                        className="flex-1 flex items-center justify-center gap-1 bg-white border border-neutral-300 py-1.5 rounded hover:bg-blue-50 hover:border-blue-300 text-xs font-medium transition-colors">
                        <GripVertical className="w-3.5 h-3.5" /> Vertical <kbd className="ml-1 text-neutral-400 text-[9px] bg-neutral-100 px-1 rounded">V</kbd>
                      </button>
                      <button onClick={() => handleSplit('H')}
                        className="flex-1 flex items-center justify-center gap-1 bg-white border border-neutral-300 py-1.5 rounded hover:bg-blue-50 hover:border-blue-300 text-xs font-medium transition-colors">
                        <GripHorizontal className="w-3.5 h-3.5" /> Horiz <kbd className="ml-1 text-neutral-400 text-[9px] bg-neutral-100 px-1 rounded">H</kbd>
                      </button>
                    </div>
                  </div>

                  {projectMode === 'window' && (
                    <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-200">
                      <label className="block text-xs font-semibold mb-1 text-blue-700">Sliding Presets</label>
                      <p className="text-[10px] text-blue-500 mb-2">X = slides, O = fixed &mdash; auto-builds layout</p>
                      <div className="grid grid-cols-5 gap-1 mb-1">
                        {(['xo','ox','xox','oxo','oxxxo'] as const).map(cfg => (
                          <button key={cfg} onClick={() => handleSlidingPreset(cfg)}
                            title={{ xo:'2-lite: left slides right', ox:'2-lite: right slides left', xox:'3-lite: sides slide in', oxo:'3-lite: center slides', oxxxo:'5-lite: 3 inner slide' }[cfg]}
                            className="py-1.5 rounded border text-[10px] font-bold font-mono uppercase bg-white border-blue-300 hover:bg-blue-600 hover:text-white transition-colors">
                            {cfg.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {projectMode === 'window' && (
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-neutral-600">This Pane</label>
                      <select value={(selectedNode as PaneNode).paneType}
                        onChange={e => updateProp('paneType', e.target.value)}
                        className="w-full p-2 border border-neutral-300 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white text-xs">
                        {['Fixed', 'Sliding', 'Hung', 'Casement', 'Specialty'].map(group => (
                          <optgroup key={group} label={`── ${group} ──`}>
                            {WINDOW_PANE_TYPES.filter(t => t.group === group).map(t => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  )}

                  {projectMode === 'glass' && (
                    <div className="space-y-2">
                      {glazingSpec.build === 'single' ? (
                        // Single-lite: show per-pane glass type, thickness, edge finish
                        <>
                          <div>
                            <label className="block text-xs font-semibold mb-1 text-neutral-600">Glass Type</label>
                            <select value={(selectedNode as PaneNode).glassType || 'tempered'}
                              onChange={e => updateProp('glassType', e.target.value)}
                              className="w-full p-2 border border-neutral-300 rounded focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-xs">
                              {GLASS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Thickness</label>
                            <div className="flex gap-1 flex-wrap">
                              {(['1/4', '3/8', '1/2', '5/8', '3/4'] as GlassThickness[]).map(t => (
                                <button key={t} onClick={() => updateProp('glassThickness', t)}
                                  className={`px-2 py-0.5 rounded border text-xs font-mono transition-colors
                                    ${(selectedNode as PaneNode).glassThickness === t ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-neutral-300 hover:bg-neutral-50'}`}>
                                  {t}"
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold mb-1 text-neutral-600">Edge Finish</label>
                            <select value={(selectedNode as PaneNode).edgeFinish || 'polished'}
                              onChange={e => updateProp('edgeFinish', e.target.value)}
                              className="w-full p-2 border border-neutral-300 rounded focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-xs">
                              {EDGE_FINISHES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                          </div>
                        </>
                      ) : (
                        // IGU build: glass spec lives in the Glazing Spec panel
                        <div className="p-2.5 bg-blue-50 border border-blue-200 rounded text-[10px] text-blue-700 space-y-1">
                          <p className="font-bold text-blue-800">IGU — {glazingSpec.build.toUpperCase()}</p>
                          <p>
                            <span className="font-semibold">Lite 1:</span> {LITE_GLASS_TYPES.find(t => t.value === glazingSpec.lite1.glassType)?.label} {glazingSpec.lite1.thicknessMM}mm
                            {glazingSpec.lite1.hasLowE && glazingSpec.lite1.lowEProduct ? ` + ${glazingSpec.lite1.lowEProduct}` : ''}
                          </p>
                          {glazingSpec.lite2 && (
                            <p><span className="font-semibold">Lite 2:</span> {LITE_GLASS_TYPES.find(t => t.value === glazingSpec.lite2!.glassType)?.label} {glazingSpec.lite2.thicknessMM}mm
                              {glazingSpec.lite2.hasLowE && glazingSpec.lite2.lowEProduct ? ` + ${glazingSpec.lite2.lowEProduct}` : ''}
                            </p>
                          )}
                          {glazingSpec.lite3 && (
                            <p><span className="font-semibold">Lite 3:</span> {LITE_GLASS_TYPES.find(t => t.value === glazingSpec.lite3!.glassType)?.label} {glazingSpec.lite3.thicknessMM}mm</p>
                          )}
                          <p className="text-blue-500 italic mt-1">Edit full spec in Glazing Spec panel ↓</p>
                        </div>
                      )}

                      {/* Cutout placement */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-neutral-600">Holes</label>
                          <span className="text-[10px] text-neutral-400">{((selectedNode as PaneNode).cutouts || []).length} placed</span>
                        </div>

                        {/* Mirror toggle */}
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <div className="relative">
                            <input type="checkbox"
                              checked={!!(selectedNode as PaneNode).mirrorCutouts}
                              onChange={e => updateProp('mirrorCutouts', e.target.checked)}
                              className="sr-only" />
                            <div className={`w-8 h-4 rounded-full transition-colors ${(selectedNode as PaneNode).mirrorCutouts ? 'bg-blue-500' : 'bg-neutral-300'}`} />
                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${(selectedNode as PaneNode).mirrorCutouts ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </div>
                          <span className="text-[10px] text-neutral-600 font-medium">Mirror holes L↔R</span>
                        </label>

                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <label className="block text-[10px] text-neutral-400 mb-1">Hole ⌀ (in)</label>
                            <input type="number" min={0.25} max={6} step={0.125}
                              value={cutoutDiameter}
                              onChange={e => setCutoutDiameter(Number(e.target.value))}
                              className="w-full p-1.5 border border-neutral-300 rounded text-xs focus:ring-1 focus:ring-emerald-500 outline-none" />
                          </div>
                          <div className="flex-1">
                            <label className="block text-[10px] text-neutral-400 mb-1">≈ mm</label>
                            <div className="p-1.5 bg-neutral-50 rounded border border-neutral-200 text-xs text-neutral-500 font-mono">{(cutoutDiameter * 25.4).toFixed(0)}mm</div>
                          </div>
                        </div>
                        <button
                          onClick={() => setCutoutMode(m => !m)}
                          className={`w-full py-1.5 rounded text-xs font-semibold border transition-colors flex items-center justify-center gap-1.5
                            ${cutoutMode ? 'bg-emerald-600 text-white border-emerald-600 animate-pulse' : 'bg-white text-neutral-600 border-neutral-300 hover:bg-emerald-50 hover:border-emerald-400'}`}>
                          {cutoutMode ? '🎯 Click canvas to place' : '+ Place Hole'}
                        </button>
                        {cutoutMode && (
                          <p className="text-[10px] text-emerald-600 text-center">Click glass pane. Press Esc to cancel.</p>
                        )}
                        {cutoutBlocked && (
                          <p className="text-[10px] text-red-600 text-center font-bold animate-pulse">⛔ Too close to edge — blocked</p>
                        )}

                        {/* Min edge distance info */}
                        {(glazingSpec.lite1.glassType === 'tempered' || (selectedNode as PaneNode).glassType === 'tempered') && (
                          <div className="p-2 bg-red-50 border border-red-200 rounded text-[10px] text-red-700">
                            <span className="font-bold">Min edge dist:</span> {minEdgeIn.toFixed(3)}" ({(minEdgeIn * 25.4).toFixed(1)}mm)<br/>
                            <span className="text-red-500">= {glazingSpec.lite1.thicknessMM}mm × 5 &mdash; ENFORCED</span>
                          </div>
                        )}

                        {/* Cutout list with per-hole diameter editing */}
                        {((selectedNode as PaneNode).cutouts || []).length > 0 && (
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {((selectedNode as PaneNode).cutouts as Cutout[]).map((c, i) => {
                              const paneData = panesList.find(p => p.id === selectedNode!.id);
                              const pW = paneData ? paneData.w / scale : overallWidth;
                              const pH = paneData ? paneData.h / scale : overallHeight;
                              const isTempered = glazingSpec.lite1.glassType === 'tempered' || (selectedNode as PaneNode).glassType === 'tempered';
                              const r = c.diameter / 2;
                              const violation = isTempered && (
                                c.x - r < minEdgeIn || c.y - r < minEdgeIn ||
                                pW - (c.x + r) < minEdgeIn || pH - (c.y + r) < minEdgeIn
                              );
                              return (
                                <div key={c.id} className={`p-1.5 rounded text-[10px] border space-y-1
                                  ${violation ? 'bg-red-50 border-red-300' : c.mirrored ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'}`}>
                                  <div className="flex items-center justify-between">
                                    <span className={`font-mono font-semibold ${violation ? 'text-red-700' : c.mirrored ? 'text-blue-700' : 'text-green-700'}`}>
                                      {violation ? '⚠' : c.mirrored ? '🔵 M' : '✓'} #{i+1} @ {toFraction(c.x)}",{toFraction(c.y)}"
                                    </span>
                                    <button onClick={() => {
                                      const newTree = updateNode(tree, selectedNode!.id, n => ({
                                        ...n, cutouts: ((n as PaneNode).cutouts || []).filter((x: Cutout) => x.id !== c.id)
                                      }));
                                      pushState({ ...editorState, tree: newTree });
                                    }} className="text-red-400 hover:text-red-600">✕</button>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-neutral-400">⌀</span>
                                    <input type="number" min={0.25} max={6} step={0.125}
                                      value={c.diameter}
                                      onChange={ev => {
                                        const newD = Number(ev.target.value);
                                        const newTree = updateNode(tree, selectedNode!.id, n => ({
                                          ...n, cutouts: ((n as PaneNode).cutouts || []).map((x: Cutout) =>
                                            x.id === c.id ? { ...x, diameter: newD } : x
                                          )
                                        }));
                                        pushState({ ...editorState, tree: newTree });
                                      }}
                                      className="w-14 border border-neutral-300 rounded px-1 py-0.5 text-[10px] font-mono outline-none focus:ring-1 focus:ring-blue-400" />
                                    <span className="text-neutral-400">in = {(c.diameter * 25.4).toFixed(0)}mm</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <button onClick={handleDelete}
                    className="w-full flex items-center justify-center gap-1.5 text-red-600 border border-red-200 bg-red-50 py-1.5 rounded hover:bg-red-100 transition-colors text-xs font-semibold">
                    <Trash2 className="w-3.5 h-3.5" />
                    {selectedId === 'root' ? 'Reset Layout' : 'Delete'} <kbd className="text-red-300 text-[9px] bg-red-100 px-1 rounded">Del</kbd>
                  </button>
                </div>
              )}

              {selectedNode?.type === 'split' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-neutral-600">Mullion Position</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="0.1" max="0.9" step="0.01"
                        value={(selectedNode as SplitNode).ratio}
                        onChange={e => {
                          const newTree = updateNode(tree, selectedId, n => ({ ...n, ratio: Number(e.target.value) }));
                          setEditorState(prev => ({ ...prev, tree: newTree }));
                        }}
                        className="flex-1" />
                      <span className="text-xs font-mono bg-neutral-100 px-2 py-0.5 rounded w-10 text-center">
                        {Math.round((selectedNode as SplitNode).ratio * 100)}%
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-1">Snaps at ⅓, ½, ⅔</p>
                  </div>
                  <button onClick={handleDelete}
                    className="w-full flex items-center justify-center gap-1.5 text-red-600 border border-red-200 bg-red-50 py-1.5 rounded hover:bg-red-100 transition-colors text-xs font-semibold">
                    <Trash2 className="w-3.5 h-3.5" /> Remove Mullion
                  </button>
                </div>
              )}

              {!selectedNode && (
                <p className="text-xs text-neutral-400 italic">Click a pane or mullion to edit</p>
              )}
            </div>

            {/* Glazing Spec */}
            <GlazingPanel spec={glazingSpec} onChange={setGlazingSpec} />

            {/* Shortcuts */}
            <div className="p-2.5 bg-neutral-50 rounded-lg border border-neutral-100">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Shortcuts</p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {[['V', 'Split vert.'], ['H', 'Split horiz.'], ['Del', 'Delete'], ['Esc', 'Deselect'], ['Ctrl+Z', 'Undo'], ['Ctrl+Y', 'Redo']].map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1 text-[10px] text-neutral-500">
                    <kbd className="bg-white border border-neutral-200 px-1 rounded text-[9px] font-mono">{k}</kbd>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* LEFT RESIZE HANDLE */}
        <div onMouseDown={e => startSidebarDrag(e, 'left')}
          style={{ width: 5, cursor: 'col-resize', flexShrink: 0, zIndex: 20, background: 'transparent' }}
          className="hover:bg-blue-400 active:bg-blue-500 transition-colors" />

        {/* CENTER CANVAS */}
        <div className="flex-1 relative flex flex-col bg-slate-100 overflow-hidden"
          onClick={() => setSelectedId('root')}>
          <div className="absolute top-3 right-3 z-10">
            <div className={`px-3 py-1.5 rounded-full shadow border text-xs font-semibold flex items-center gap-2
              ${projectMode === 'glass' ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-neutral-600 border-neutral-200'}`}>
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${projectMode === 'glass' ? 'bg-white' : 'bg-blue-500'}`} />
              {projectMode === 'glass' ? 'Glass Panel — frameless' : 'Drag mullions to resize'}
            </div>
          </div>
          <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 bg-white p-1 rounded-lg shadow border border-neutral-200">
            <button onClick={() => setScale(s => Math.min(s + 2, 32))} className="w-8 h-8 flex items-center justify-center hover:bg-neutral-100 rounded font-bold text-neutral-600">+</button>
            <span className="px-2 text-xs text-neutral-400 font-mono">{scale}px/in</span>
            <button onClick={() => setScale(s => Math.max(s - 2, 4))} className="w-8 h-8 flex items-center justify-center hover:bg-neutral-100 rounded font-bold text-neutral-600">−</button>
          </div>
          <div className="flex-1 w-full h-full overflow-auto flex items-center justify-center"
            style={{ cursor: dragState ? (dragState.dir === 'V' ? 'col-resize' : 'row-resize') : 'default' }}>
            <svg ref={svgRef} width={svgW} height={svgH}
              style={{ backgroundColor: 'white', backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 1px)', backgroundSize: '20px 20px' }}
              className="drop-shadow-2xl">
              <defs>
                <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M1,1 L5,3 L1,5" fill="none" stroke="#64748b" strokeWidth="1.5" />
                </marker>
                <marker id="arrow-s" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto">
                  <path d="M5,1 L1,3 L5,5" fill="none" stroke="#64748b" strokeWidth="1.5" />
                </marker>
              </defs>
              <g transform={`translate(${px},${py})`}>
                <rect x={0} y={0} width={overallWidth * scale} height={overallHeight * scale}
                  fill="#f8fafc"
                  stroke={projectMode === 'glass' ? '#10b981' : '#0f172a'}
                  strokeWidth={projectMode === 'glass' ? 2 : 5}
                  strokeDasharray={projectMode === 'glass' ? '10 4' : undefined} />
                <g transform={`translate(${innerOX},${innerOY})`}>
                  {renderNode(tree, 0, 0, innerW, innerH)}
                </g>
        {/* WIDTH DIM — clickable */}
                <g transform="translate(0,-34)" style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); openDimEdit(); }}>
                  <line x1={0} y1={0} x2={overallWidth * scale} y2={0} stroke="#94a3b8" strokeWidth={1} markerStart="url(#arrow-s)" markerEnd="url(#arrow)" />
                  <rect x={(overallWidth * scale) / 2 - 42} y={-13} width={84} height={26} fill="white" rx={5} stroke="#e2e8f0" strokeWidth={1} />
                  <text x={(overallWidth * scale) / 2} y={6} textAnchor="middle" fontSize={13} fontWeight={700} fill="#2563eb">{toFraction(overallWidth)}″</text>
                  <text x={(overallWidth * scale) / 2} y={-1} textAnchor="middle" fontSize={7} fill="#94a3b8" dy={-8}>click to edit</text>
                </g>
                {/* HEIGHT DIM — clickable */}
                <g transform="translate(-34,0)" style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); openDimEdit(); }}>
                  <line x1={0} y1={0} x2={0} y2={overallHeight * scale} stroke="#94a3b8" strokeWidth={1} markerStart="url(#arrow-s)" markerEnd="url(#arrow)" />
                  <rect x={-13} y={(overallHeight * scale) / 2 - 42} width={26} height={84} fill="white" rx={5} stroke="#e2e8f0" strokeWidth={1} />
                  <text x={0} y={(overallHeight * scale) / 2} textAnchor="middle" dominantBaseline="middle" fontSize={13} fontWeight={700} fill="#2563eb"
                    transform={`rotate(-90 0,${(overallHeight * scale) / 2})`}>{toFraction(overallHeight)}″</text>
                </g>
              </g>
            </svg>
          </div>
          {/* Dimension edit overlay */}
          {dimEditActive && (
            <div className="absolute inset-0 flex items-start justify-center pt-14 z-50" style={{ pointerEvents: 'none' }}>
              <div className="bg-white rounded-xl shadow-2xl border border-neutral-200 p-4" style={{ pointerEvents: 'auto' }}
                onClick={e => e.stopPropagation()}>
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2.5">Edit Dimensions</p>
                <div className="flex items-end gap-3">
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1">Width (in)</label>
                    <input type="number" step="0.0625" min="1" value={dimWInput}
                      onChange={e => setDimWInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmDimEdit(); if (e.key === 'Escape') setDimEditActive(false); }}
                      className="w-24 border border-neutral-300 rounded px-2 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-400" autoFocus />
                  </div>
                  <span className="text-neutral-400 text-xl mb-1.5">×</span>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1">Height (in)</label>
                    <input type="number" step="0.0625" min="1" value={dimHInput}
                      onChange={e => setDimHInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmDimEdit(); if (e.key === 'Escape') setDimEditActive(false); }}
                      className="w-24 border border-neutral-300 rounded px-2 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <button onClick={confirmDimEdit}
                    className="h-9 px-3 bg-blue-600 text-white rounded text-sm font-bold hover:bg-blue-700 transition-colors">✓</button>
                  <button onClick={() => setDimEditActive(false)}
                    className="h-9 px-3 bg-neutral-100 text-neutral-600 rounded text-sm hover:bg-neutral-200 transition-colors">✕</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT RESIZE HANDLE */}
        <div onMouseDown={e => startSidebarDrag(e, 'right')}
          style={{ width: 5, cursor: 'col-resize', flexShrink: 0, zIndex: 20, background: 'transparent' }}
          className="hover:bg-blue-400 active:bg-blue-500 transition-colors" />
        {/* RIGHT SIDEBAR — BOM */}
        <div style={{ width: rightW, minWidth: 160, maxWidth: 480, zoom: sidebarZoom, flexShrink: 0 }}
          className="bg-white border-l border-neutral-200 flex flex-col z-10">
          <div className="p-3 border-b border-neutral-200 bg-neutral-50">
            <h2 className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
              <XSquare className="w-3.5 h-3.5" /> Bill of Materials
            </h2>
            <p className="text-[11px] text-neutral-400 mt-0.5">{panesList.length} pane{panesList.length !== 1 ? 's' : ''}</p>
            {projectMode === 'window' && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[10px] text-neutral-400">Unit config:</span>
                <span className="font-mono font-bold text-sm tracking-widest text-blue-700">{deriveXOString(tree)}</span>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
            {panesList.map((pane, idx) => {
              const wIn = pane.w / scale, hIn = pane.h / scale;
              const area = (wIn * hIn / 144).toFixed(2);
              const isSel = selectedId === pane.id;
              const typeLabel = projectMode === 'glass'
                ? `${pane.glassThickness || '1/2'}" ${GLASS_TYPES.find(g => g.value === pane.glassType)?.label || 'Glass'}`
                : (WINDOW_PANE_TYPES.find(t => t.value === pane.paneType)?.label || pane.paneType);
              return (
                <div key={pane.id} onClick={() => setSelectedId(pane.id)}
                  className={`p-2 rounded-lg border cursor-pointer transition-all text-xs
                    ${isSel ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-neutral-50 border-neutral-200 hover:border-blue-200'}`}>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="font-bold text-neutral-700">#{idx + 1}</span>
                    <span className="text-[9px] font-mono bg-white px-1 py-0.5 rounded text-neutral-500 border border-neutral-200 truncate max-w-[100px]">{typeLabel}</span>
                  </div>
                  <div className="font-semibold text-neutral-900">{toFraction(wIn)} × {toFraction(hIn)}</div>
                  <div className="text-neutral-400 mt-0.5">{area} ft²
                    {projectMode === 'glass' && (pane.cutouts || []).length > 0 && <span className="ml-1.5 text-amber-600">⬤ {(pane.cutouts || []).length} holes</span>}
                  </div>
                </div>
              );
            })}
            {panesList.length > 1 && (
              <div className="p-2 rounded-lg bg-neutral-100 border border-neutral-200 text-xs mt-1">
                <span className="font-bold text-neutral-500">TOTAL </span>
                <span className="font-semibold">{panesList.reduce((s, p) => s + (p.w / scale) * (p.h / scale) / 144, 0).toFixed(2)} ft²</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// GLAZING PANEL
// ─────────────────────────────────────────────
function LiteSection({ lite, liteNum, onChange }: {
  lite: LiteSpec; liteNum: number;
  onChange: (updated: LiteSpec) => void;
}) {
  const mfr = LOW_E_DATABASE.find(m => m.name === lite.lowEManufacturer);
  const product = mfr?.products.find(p => p.name === lite.lowEProduct);

  const setMfr = (name: string) => {
    const m = LOW_E_DATABASE.find(x => x.name === name);
    const firstProd = m?.products[0];
    onChange({ ...lite, lowEManufacturer: name, lowEProduct: firstProd?.name, lowESurface: firstProd?.surfaces[0] });
  };

  const setProd = (name: string) => {
    const p = mfr?.products.find(x => x.name === name);
    onChange({ ...lite, lowEProduct: name, lowESurface: p?.surfaces[0] });
  };

  const liteColors: Record<number, string> = { 1: 'text-blue-600', 2: 'text-emerald-600', 3: 'text-purple-600' };
  const liteBg: Record<number, string> = { 1: 'bg-blue-50 border-blue-200', 2: 'bg-emerald-50 border-emerald-200', 3: 'bg-purple-50 border-purple-200' };

  return (
    <div className={`rounded-lg border p-2.5 space-y-2 ${liteBg[liteNum]}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider ${liteColors[liteNum]}`}>
        ● Lite {liteNum}
      </p>

      {/* Thickness — per-ply for lam types, single for monolithic */}
      {isLamType(lite.glassType) ? (
        <div className="space-y-1.5">
          {(['Ply 1', 'Ply 2'] as const).map((label, idx) => {
            const field = idx === 0 ? 'ply1MM' : 'ply2MM';
            const val = idx === 0 ? lite.ply1MM : lite.ply2MM;
            return (
              <div key={label}>
                <label className="block text-[10px] text-neutral-500 mb-1">{label} Thickness</label>
                <div className="flex flex-wrap gap-1">
                  {LITE_THICKNESS_MM.map(t => (
                    <button key={t.mm} onClick={() => onChange({ ...lite, [field]: t.mm })}
                      title={t.frac}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors
                        ${val === t.mm ? 'bg-neutral-800 text-white border-neutral-800' : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-500'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {lite.ply1MM && lite.ply2MM && (
            <p className="text-[9px] text-neutral-400 font-mono">
              Total: {liteTotalMM(lite).toFixed(2)}mm ({mmToFrac(liteTotalMM(lite))})
            </p>
          )}
        </div>
      ) : (
        <div>
          <label className="block text-[10px] text-neutral-500 mb-1">Thickness</label>
          <div className="flex flex-wrap gap-1">
            {LITE_THICKNESS_MM.map(t => (
              <button key={t.mm} onClick={() => onChange({ ...lite, thicknessMM: t.mm })}
                title={t.frac}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors
                  ${lite.thicknessMM === t.mm ? 'bg-neutral-800 text-white border-neutral-800' : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-500'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Glass type */}
      <div>
        <label className="block text-[10px] text-neutral-500 mb-1">Type</label>
        <select value={lite.glassType} onChange={e => onChange({ ...lite, glassType: e.target.value as LiteGlassType })}
          className="w-full text-xs border border-neutral-300 rounded px-1.5 py-1 bg-white outline-none focus:ring-1 focus:ring-blue-400">
          {LITE_GLASS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Interlayer — only for laminated types */}
      {(lite.glassType === 'laminated' || lite.glassType === 'lam-tempered' || lite.glassType === 'lam-hs') && (
        <div>
          <label className="block text-[10px] text-neutral-500 mb-1">Interlayer</label>
          <select value={lite.interlayer || 'pvb-0.76'} onChange={e => onChange({ ...lite, interlayer: e.target.value as LamInterlayer })}
            className="w-full text-xs border border-neutral-300 rounded px-1.5 py-1 bg-white outline-none focus:ring-1 focus:ring-blue-400">
            {INTERLAYERS.map(il => <option key={il.value} value={il.value}>{il.label}</option>)}
          </select>
          <p className="text-[9px] text-neutral-400 mt-1 font-mono">
            {lamConstruction(lite)}
          </p>
        </div>
      )}

      {/* Tint */}
      <div>
        <label className="block text-[10px] text-neutral-500 mb-1">Tint</label>
        <div className="flex gap-1.5">
          {LITE_TINTS.map(t => (
            <button key={t.value} onClick={() => onChange({ ...lite, tint: t.value })}
              title={t.label}
              className={`w-6 h-6 rounded-full border-2 transition-all ${lite.tint === t.value ? 'border-neutral-800 scale-110' : 'border-neutral-300 hover:border-neutral-500'}`}
              style={{ backgroundColor: t.color }} />
          ))}
        </div>
      </div>

      {/* Low-E */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-neutral-500">Low-E Coating</label>
          <button onClick={() => onChange({ ...lite, hasLowE: !lite.hasLowE })}
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${lite.hasLowE ? 'bg-blue-500' : 'bg-neutral-300'}`}>
            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${lite.hasLowE ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        {lite.hasLowE && (
          <div className="space-y-1.5 mt-1">
            <select value={lite.lowEManufacturer || ''} onChange={e => setMfr(e.target.value)}
              className="w-full text-xs border border-neutral-300 rounded px-1.5 py-1 bg-white outline-none focus:ring-1 focus:ring-blue-400">
              <option value="">— Select Manufacturer —</option>
              {LOW_E_DATABASE.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
            {mfr && (
              <select value={lite.lowEProduct || ''} onChange={e => setProd(e.target.value)}
                className="w-full text-xs border border-neutral-300 rounded px-1.5 py-1 bg-white outline-none focus:ring-1 focus:ring-blue-400">
                {mfr.products.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            )}
            {product && (
              <div>
                <label className="block text-[10px] text-neutral-400 mb-1">Surface</label>
                <div className="flex gap-1">
                  {product.surfaces.map(s => (
                    <button key={s} onClick={() => onChange({ ...lite, lowESurface: s })}
                      className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors
                        ${lite.lowESurface === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-neutral-600 border-neutral-300 hover:border-blue-400'}`}>
                      #{s}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-neutral-400 mt-1 italic">{product.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SpacerSection({ spacer, gasFill, spacerNum, onChange, onGasChange }: {
  spacer: SpacerSpec; gasFill: GasFill; spacerNum: number;
  onChange: (s: SpacerSpec) => void;
  onGasChange: (g: GasFill) => void;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">◆ Spacer {spacerNum}</p>
      <div>
        <label className="block text-[10px] text-neutral-500 mb-1">Type</label>
        <select value={spacer.type} onChange={e => onChange({ ...spacer, type: e.target.value as SpacerType })}
          className="w-full text-xs border border-neutral-300 rounded px-1.5 py-1 bg-white outline-none focus:ring-1 focus:ring-amber-400">
          {SPACER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[10px] text-neutral-500 mb-1">Width</label>
        <div className="flex flex-wrap gap-1">
          {SPACER_WIDTHS.map(w => (
            <button key={w.mm} onClick={() => onChange({ ...spacer, widthMM: w.mm })}
              title={w.frac}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors
                ${spacer.widthMM === w.mm ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-neutral-600 border-neutral-300 hover:border-amber-400'}`}>
              {w.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-[10px] text-neutral-500 mb-1">Gas Fill</label>
        <div className="flex flex-wrap gap-1">
          {GAS_FILLS.map(g => (
            <button key={g.value} onClick={() => onGasChange(g.value)}
              className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors
                ${gasFill === g.value ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-neutral-600 border-neutral-300 hover:border-slate-400'}`}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function GlazingPanel({ spec, onChange }: { spec: GlazingSpec; onChange: (s: GlazingSpec) => void }) {
  const [open, setOpen] = useState(true);
  const totalMM = calcIguThicknessMM(spec);
  const totalLabel = `${totalMM}mm (≈ ${mmToFrac(totalMM)})`;

  const updateLite1 = (l: LiteSpec) => onChange({ ...spec, lite1: l });
  const updateLite2 = (l: LiteSpec) => onChange({ ...spec, lite2: l });
  const updateLite3 = (l: LiteSpec) => onChange({ ...spec, lite3: l });
  const updateSpacer1 = (s: SpacerSpec) => onChange({ ...spec, spacer1: s });
  const updateSpacer2 = (s: SpacerSpec) => onChange({ ...spec, spacer2: s });

  const setBuild = (build: IguBuild) => {
    const next: GlazingSpec = { ...spec, build };
    if (build === 'single') { delete next.spacer1; delete next.gasFill1; delete next.lite2; delete next.spacer2; delete next.gasFill2; delete next.lite3; }
    if (build === 'double') {
      next.spacer1 = spec.spacer1 || { type: 'aluminum', widthMM: '12' };
      next.gasFill1 = spec.gasFill1 || 'argon-90';
      next.lite2 = spec.lite2 || makeDefaultLite();
      delete next.spacer2; delete next.gasFill2; delete next.lite3;
    }
    if (build === 'triple') {
      next.spacer1 = spec.spacer1 || { type: 'aluminum', widthMM: '12' };
      next.gasFill1 = spec.gasFill1 || 'argon-90';
      next.lite2 = spec.lite2 || makeDefaultLite();
      next.spacer2 = spec.spacer2 || { type: 'aluminum', widthMM: '12' };
      next.gasFill2 = spec.gasFill2 || 'argon-90';
      next.lite3 = spec.lite3 || makeDefaultLite();
    }
    onChange(next);
  };

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-neutral-100 hover:bg-neutral-200 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider">Glazing Spec</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${spec.build === 'single' ? 'bg-neutral-200 text-neutral-600' : spec.build === 'double' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
            {spec.build.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-neutral-500">{totalLabel}</span>
          <span className="text-neutral-400 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="p-2.5 space-y-2.5 bg-white">
          {/* Build selector */}
          <div>
            <label className="block text-[10px] text-neutral-500 mb-1.5">IGU Build</label>
            <div className="grid grid-cols-3 gap-1">
              {(['single', 'double', 'triple'] as IguBuild[]).map(b => (
                <button key={b} onClick={() => setBuild(b)}
                  className={`py-1 rounded text-xs font-semibold border capitalize transition-colors
                    ${spec.build === b ? 'bg-neutral-800 text-white border-neutral-800' : 'bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50'}`}>
                  {b}
                </button>
              ))}
            </div>
          </div>

          <LiteSection lite={spec.lite1} liteNum={1} onChange={updateLite1} />

          {(spec.build === 'double' || spec.build === 'triple') && spec.spacer1 && (
            <SpacerSection
              spacer={spec.spacer1} gasFill={spec.gasFill1 || 'argon-90'} spacerNum={1}
              onChange={updateSpacer1} onGasChange={g => onChange({ ...spec, gasFill1: g })}
            />
          )}

          {(spec.build === 'double' || spec.build === 'triple') && spec.lite2 && (
            <LiteSection lite={spec.lite2} liteNum={2} onChange={updateLite2} />
          )}

          {spec.build === 'triple' && spec.spacer2 && (
            <SpacerSection
              spacer={spec.spacer2} gasFill={spec.gasFill2 || 'argon-90'} spacerNum={2}
              onChange={updateSpacer2} onGasChange={g => onChange({ ...spec, gasFill2: g })}
            />
          )}

          {spec.build === 'triple' && spec.lite3 && (
            <LiteSection lite={spec.lite3} liteNum={3} onChange={updateLite3} />
          )}

          {/* Total thickness summary */}
          <div className="flex items-center justify-between p-2 bg-neutral-900 rounded-lg">
            <span className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">Total IGU</span>
            <span className="text-sm font-bold text-white font-mono">{totalLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// PANE INDICATORS
// ─────────────────────────────────────────────
function PaneIndicators({ type, w, h }: { type: WindowPaneType; w: number; h: number }) {
  const cx = w / 2, cy = h / 2;
  const al = Math.min(w, h) * 0.28;
  const s = "#475569", sw = "2", me = "url(#arrow)";
  switch (type) {
    case 'slide-l': return <line x1={cx + al / 2} y1={cy} x2={cx - al / 2} y2={cy} stroke={s} strokeWidth={sw} markerEnd={me} />;
    case 'slide-r': return <line x1={cx - al / 2} y1={cy} x2={cx + al / 2} y2={cy} stroke={s} strokeWidth={sw} markerEnd={me} />;
    case 'slide-u': return <line x1={cx} y1={cy + al / 2} x2={cx} y2={cy - al / 2} stroke={s} strokeWidth={sw} markerEnd={me} />;
    case 'slide-d': return <line x1={cx} y1={cy - al / 2} x2={cx} y2={cy + al / 2} stroke={s} strokeWidth={sw} markerEnd={me} />;
    case 'double-hung': return <><line x1={cx} y1={cy - al * 0.1} x2={cx} y2={cy - al * 0.6} stroke={s} strokeWidth={sw} markerEnd={me} /><line x1={cx} y1={cy + al * 0.1} x2={cx} y2={cy + al * 0.6} stroke={s} strokeWidth={sw} markerEnd={me} /></>;
    case 'casement-l': return <path d={`M${w} 0 L0 ${cy} L${w} ${h}`} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" />;
    case 'casement-r': return <path d={`M0 0 L${w} ${cy} L0 ${h}`} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" />;
    case 'awning': return <path d={`M0 ${h} L${cx} 0 L${w} ${h}`} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" />;
    case 'hopper': return <path d={`M0 0 L${cx} ${h} L${w} 0`} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" />;
    case 'tilt-turn': return <><path d={`M0 0 L${w} ${cy} L0 ${h}`} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" /><line x1={cx} y1={cy + al * 0.1} x2={cx} y2={cy + al * 0.6} stroke={s} strokeWidth={sw} markerEnd={me} /></>;
    case 'patio-xo': return <line x1={cx + al * 0.3} y1={cy} x2={cx - al * 0.3} y2={cy} stroke={s} strokeWidth={sw} markerEnd={me} />;
    case 'patio-ox': return <line x1={cx - al * 0.3} y1={cy} x2={cx + al * 0.3} y2={cy} stroke={s} strokeWidth={sw} markerEnd={me} />;
    case 'patio-xox': return <><line x1={w * 0.33} y1={cy} x2={w * 0.14} y2={cy} stroke={s} strokeWidth={sw} markerEnd={me} /><line x1={w * 0.66} y1={cy} x2={w * 0.85} y2={cy} stroke={s} strokeWidth={sw} markerEnd={me} /></>;
    case 'patio-oxxxo': return <><line x1={w * 0.28} y1={cy} x2={w * 0.12} y2={cy} stroke={s} strokeWidth={sw} markerEnd={me} /><line x1={w * 0.5} y1={cy - al * 0.15} x2={w * 0.5} y2={cy + al * 0.15} stroke={s} strokeWidth={sw} /><line x1={w * 0.72} y1={cy} x2={w * 0.88} y2={cy} stroke={s} strokeWidth={sw} markerEnd={me} /></>;
    case 'bifold': return <>{[0.25, 0.5, 0.75].map(fx => <line key={fx} x1={w * fx} y1={4} x2={w * fx} y2={h - 4} stroke="#d1d5db" strokeWidth="1" strokeDasharray="3 3" />)}<line x1={cx - al / 2} y1={cy} x2={cx + al / 2} y2={cy} stroke={s} strokeWidth={sw} markerEnd={me} /></>;
    default: return null;
  }
}