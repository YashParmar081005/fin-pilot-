import { useMemo, useState } from 'react';
import { formatINR, normalBalance, type AccountType } from '@finpilot/shared';

export interface AccountRow {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subType: string;
  parentId: string | null;
  path: string;
  depth: number;
  isSystem: boolean;
  isActive: boolean;
  currentBalancePaise: number;
}

const typeColors: Record<AccountType, string> = {
  asset: '#38BDF8',
  liability: '#F87171',
  equity: '#A78BFA',
  income: '#34D399',
  expense: '#FBBF24',
};

interface TreeNode {
  account: AccountRow;
  children: TreeNode[];
}

function buildTree(accounts: AccountRow[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>(
    accounts.map((a) => [a.id, { account: a, children: [] }]),
  );
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.account.parentId ? nodes.get(node.account.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const byCode = (a: TreeNode, b: TreeNode) => a.account.code.localeCompare(b.account.code);
  for (const node of nodes.values()) node.children.sort(byCode);
  roots.sort(byCode);
  return roots;
}

function Node({ node }: { node: TreeNode }) {
  const [open, setOpen] = useState(true);
  const { account } = node;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0.3rem 0.5rem',
          paddingLeft: `${0.5 + account.depth * 1.4}rem`,
          borderRadius: 6,
          fontSize: '0.9rem',
        }}
      >
        <button
          onClick={() => setOpen(!open)}
          style={{
            width: 18,
            border: 'none',
            background: 'none',
            color: '#64748B',
            cursor: hasChildren ? 'pointer' : 'default',
            visibility: hasChildren ? 'visible' : 'hidden',
          }}
        >
          {open ? '▾' : '▸'}
        </button>
        <span style={{ color: '#64748B', fontFamily: 'monospace' }}>{account.code}</span>
        <span style={{ fontWeight: hasChildren ? 600 : 400 }}>{account.name}</span>
        <span
          style={{
            fontSize: '0.7rem',
            padding: '0.05rem 0.45rem',
            borderRadius: 999,
            background: '#0F172A',
            color: typeColors[account.type],
          }}
        >
          {account.type} · {normalBalance(account.type)}
        </span>
        {account.isSystem && (
          <span style={{ fontSize: '0.7rem', color: '#64748B' }} title="system account">
            ⚙
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontFamily: 'monospace', color: '#94A3B8' }}>
          {formatINR(account.currentBalancePaise)}
        </span>
      </div>
      {open && node.children.map((child) => <Node key={child.account.id} node={child} />)}
    </div>
  );
}

export function AccountsTree({ accounts }: { accounts: AccountRow[] }) {
  const roots = useMemo(() => buildTree(accounts), [accounts]);
  return (
    <div>
      {roots.map((node) => (
        <Node key={node.account.id} node={node} />
      ))}
    </div>
  );
}
