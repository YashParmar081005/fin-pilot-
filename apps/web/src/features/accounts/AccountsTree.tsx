import { useMemo, useState, useEffect } from 'react';
import { formatINR, normalBalance, type AccountType } from '@finpilot/shared';
import { C, S, Btn } from '../../lib/ui';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Search01Icon,
  Folder01Icon,
  FolderOpenIcon,
  Settings01Icon,
} from '@hugeicons/core-free-icons';

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
  asset: 'var(--accent)',
  liability: 'var(--red)',
  equity: '#8b5cf6',
  income: 'var(--green)',
  expense: 'var(--amber)',
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

function Node({
  node,
  search,
  expanded,
  onToggle,
  matchesSearch,
}: {
  node: TreeNode;
  search: string;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  matchesSearch: (node: TreeNode, query: string) => boolean;
}) {
  const { account } = node;
  const hasChildren = node.children.length > 0;
  const isOpen = expanded[account.id] !== false;

  return (
    <div>
      <div
        className="fp-account-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0.65rem 1rem',
          paddingLeft: `${0.75 + account.depth * 1.5}rem`,
          borderRadius: 8,
          fontSize: '0.95rem',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          borderBottom: `1px solid ${C.border}22`,
          position: 'relative',
        }}
        onClick={() => hasChildren && onToggle(account.id)}
      >
        {/* Indentation Guideline */}
        {Array.from({ length: account.depth }).map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${0.75 + i * 1.5 + 0.45}rem`,
              top: 0,
              bottom: 0,
              width: 1.5,
              background: C.border,
              opacity: 0.35,
            }}
          />
        ))}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            color: C.muted,
            visibility: hasChildren ? 'visible' : 'hidden',
          }}
        >
          <HugeiconsIcon
            icon={isOpen ? ArrowDown01Icon : ArrowRight01Icon}
            size={16}
          />
        </div>

        <span
          style={{
            color: isOpen && hasChildren ? C.accent : C.muted,
            display: 'inline-flex',
            alignItems: 'center',
            marginRight: 2,
          }}
        >
          <HugeiconsIcon
            icon={hasChildren ? (isOpen ? FolderOpenIcon : Folder01Icon) : Settings01Icon}
            size={18}
          />
        </span>

        <span className="fp-mono" style={{ color: C.muted, fontWeight: 500 }}>
          {account.code}
        </span>
        
        <span style={{ fontWeight: hasChildren ? 600 : 400, color: C.text }}>
          {account.name}
        </span>

        <span
          style={{
            fontSize: '0.72rem',
            padding: '0.12rem 0.55rem',
            borderRadius: 999,
            background: `${typeColors[account.type]}12`,
            border: `1px solid ${typeColors[account.type]}22`,
            color: typeColors[account.type],
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginLeft: 6,
          }}
        >
          {account.type} · {normalBalance(account.type)}
        </span>

        {account.isSystem && (
          <span
            style={{
              fontSize: '0.72rem',
              color: C.muted,
              background: `${C.panel2}`,
              border: `1px solid ${C.border}`,
              padding: '0.05rem 0.35rem',
              borderRadius: 4,
            }}
            title="System account"
          >
            SYSTEM
          </span>
        )}

        <span className="fp-mono" style={{ marginLeft: 'auto', fontWeight: 600, color: C.text }}>
          {formatINR(account.currentBalancePaise)}
        </span>
      </div>

      {isOpen &&
        node.children
          .filter((child) => matchesSearch(child, search))
          .map((child) => (
            <Node
              key={child.account.id}
              node={child}
              search={search}
              expanded={expanded}
              onToggle={onToggle}
              matchesSearch={matchesSearch}
            />
          ))}
    </div>
  );
}

export function AccountsTree({ accounts }: { accounts: AccountRow[] }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const roots = useMemo(() => buildTree(accounts), [accounts]);

  const allParentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of accounts) {
      if (a.parentId) ids.add(a.parentId);
    }
    return Array.from(ids);
  }, [accounts]);

  const handleExpandAll = () => {
    const next: Record<string, boolean> = {};
    for (const id of allParentIds) {
      next[id] = true;
    }
    setExpanded(next);
  };

  const handleCollapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const id of allParentIds) {
      next[id] = false;
    }
    setExpanded(next);
  };

  const handleToggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: prev[id] === false }));
  };

  const matchesSearch = (node: TreeNode, query: string): boolean => {
    if (!query) return true;
    const q = query.toLowerCase();
    const selfMatches =
      node.account.name.toLowerCase().includes(q) ||
      node.account.code.toLowerCase().includes(q) ||
      node.account.type.toLowerCase().includes(q);

    if (selfMatches) return true;
    return node.children.some((child) => matchesSearch(child, query));
  };

  // Auto-expand parents when search query is entered
  useEffect(() => {
    if (!search) return;
    const next = { ...expanded };
    const expandMatchingParents = (node: TreeNode) => {
      const match = matchesSearch(node, search);
      if (match && node.children.length > 0) {
        next[node.account.id] = true;
        node.children.forEach(expandMatchingParents);
      }
    };
    roots.forEach(expandMatchingParents);
    setExpanded(next);
  }, [search, roots]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: 450 }}>
          <span
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              color: C.muted,
              display: 'inline-flex',
            }}
          >
            <HugeiconsIcon icon={Search01Icon} size={20} />
          </span>
          <input
            type="text"
            placeholder="Search by code, name, type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              ...S.input,
              paddingLeft: '2.75rem',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn small kind="ghost" onClick={handleExpandAll}>
            Expand all
          </Btn>
          <Btn small kind="ghost" onClick={handleCollapseAll}>
            Collapse all
          </Btn>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {roots
          .filter((node) => matchesSearch(node, search))
          .map((node) => (
            <Node
              key={node.account.id}
              node={node}
              search={search}
              expanded={expanded}
              onToggle={handleToggle}
              matchesSearch={matchesSearch}
            />
          ))}
      </div>
    </div>
  );
}
