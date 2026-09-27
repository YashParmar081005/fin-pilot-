/**
 * The sections of the product a platform operator can switch off per company.
 *
 * Stored on the company as `disabledModules` — the *disabled* list, not the
 * enabled one, so every company that already exists keeps everything without a
 * migration, and a module added later is on by default rather than silently
 * missing for everyone.
 *
 * `routes` is the enforcement surface: the API refuses those prefixes when the
 * module is off, so switching a section off is a real restriction and not a
 * hidden nav item. `nav` is what the web app hides.
 *
 * Two things are deliberately not listed and can never be switched off: the
 * chart of accounts and the journal. Every posting in the product lands in
 * them, so a company without them is not a company that can do anything.
 */
export interface ModuleDef {
  key: string;
  label: string;
  description: string;
  /** API path prefixes under /api/v1 that this module owns. */
  routes: readonly string[];
  /** Route keys in the web app's nav. */
  nav: readonly string[];
}

export const MODULES: readonly ModuleDef[] = [
  {
    key: 'sales',
    label: 'Sales & invoicing',
    description: 'Raise and issue customer invoices, and e-invoicing.',
    routes: ['/invoices'],
    nav: ['invoices'],
  },
  {
    key: 'purchases',
    label: 'Bills & expenses',
    description: 'Vendor bills, expense claims and their approvals.',
    routes: ['/bills', '/expenses'],
    nav: ['bills'],
  },
  {
    key: 'money',
    label: 'Payments & banking',
    description: 'Record payments, import statements, reconcile the bank.',
    routes: ['/payments', '/bank-accounts', '/reconciliation'],
    nav: ['payments', 'banking'],
  },
  {
    key: 'compliance',
    label: 'GST & IMS',
    description: 'GSTR-1, GSTR-3B and IMS reconciliation.',
    routes: ['/gst'],
    nav: ['gst'],
  },
  {
    key: 'documents',
    label: 'Document scanning (OCR)',
    description: 'Upload a bill or statement and read it with OCR.',
    routes: ['/documents'],
    nav: ['documents'],
  },
  {
    key: 'reports',
    label: 'Reports & exports',
    description: 'Trial balance, P&L, balance sheet and queued exports.',
    routes: ['/reports', '/jobs'],
    nav: ['reports'],
  },
  {
    key: 'ai',
    label: 'AI Copilot',
    description: 'Ask questions about the books; AI proposes, a human confirms.',
    routes: ['/ai'],
    nav: ['copilot'],
  },
  {
    key: 'parties',
    label: 'Parties & items',
    description: 'Customers, vendors and the item catalogue.',
    routes: ['/parties', '/items'],
    nav: ['parties'],
  },
] as const;

export type ModuleKey = (typeof MODULES)[number]['key'];

export const MODULE_KEYS: readonly string[] = MODULES.map((m) => m.key);

export function isModuleKey(value: string): boolean {
  return MODULE_KEYS.includes(value);
}

/** The module that owns an /api/v1 path, if any. */
export function moduleForPath(path: string): ModuleDef | undefined {
  return MODULES.find((m) => m.routes.some((r) => path === r || path.startsWith(`${r}/`)));
}

/** Nav route keys hidden when these modules are disabled. */
export function hiddenNavFor(disabled: readonly string[]): string[] {
  return MODULES.filter((m) => disabled.includes(m.key)).flatMap((m) => [...m.nav]);
}
