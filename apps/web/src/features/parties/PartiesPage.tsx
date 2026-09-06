/** Customers & vendors with outstandings, plus the item master (§32 Phase 6). */
import { useState } from 'react';
import { api } from '../../lib/api';
import { Badge, Btn, Card, Err, Field, Money, Row, S, Tbl, useLoad } from '../../lib/ui';

interface Party {
  id: string;
  type: string[];
  name: string;
  gstin?: string;
  placeOfSupplyStateCode: string;
  creditDays: number;
  outstandingReceivablePaise: number;
  outstandingPayablePaise: number;
}
interface Item {
  id: string;
  name: string;
  kind: 'goods' | 'service';
  hsn?: string;
  sac?: string;
  gstRate: number;
  sellingPricePaise?: number;
  unit?: string;
}

function PartyForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'customer' | 'vendor'>('customer');
  const [state, setState] = useState('24');
  const [gstin, setGstin] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/v1/parties', {
        type: [type],
        name,
        placeOfSupplyStateCode: state,
        ...(gstin ? { gstin } : {}),
      });
      setName('');
      setGstin('');
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Row>
        <Field label="Name">
          <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Type">
          <select
            style={S.input}
            value={type}
            onChange={(e) => setType(e.target.value as 'customer' | 'vendor')}
          >
            <option value="customer">customer</option>
            <option value="vendor">vendor</option>
          </select>
        </Field>
        <Field label="State code">
          <input
            style={{ ...S.input, width: 90 }}
            value={state}
            onChange={(e) => setState(e.target.value)}
            required
          />
        </Field>
        <Field label="GSTIN (optional — checksum-validated)">
          <input
            style={S.input}
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
          />
        </Field>
        <Btn disabled={busy}>Add</Btn>
      </Row>
      <Err error={error} />
    </form>
  );
}

function ItemForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'service' | 'goods'>('service');
  const [code, setCode] = useState('');
  const [gstRate, setGstRate] = useState('18');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/v1/items', {
        name: name.trim(),
        kind,
        gstRate: Number(gstRate),
        ...(kind === 'service' ? { sac: code.trim() } : { hsn: code.trim() }),
      });
      setName('');
      setCode('');
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Row>
        <Field label="Item / service name">
          <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cloud Consulting" required />
        </Field>
        <Field label="Type">
          <select style={S.input} value={kind} onChange={(e) => setKind(e.target.value as 'service' | 'goods')}>
            <option value="service">Service (SAC)</option>
            <option value="goods">Goods (HSN)</option>
          </select>
        </Field>
        <Field label={kind === 'service' ? 'SAC (6 digits)' : 'HSN (4, 6 or 8 digits)'}>
          <input
            style={{ ...S.input, width: 140 }}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={kind === 'service' ? '998311' : '8471'}
            required
          />
        </Field>
        <Field label="GST %">
          <select style={S.input} value={gstRate} onChange={(e) => setGstRate(e.target.value)}>
            {['0', '5', '18', '40'].map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </select>
        </Field>
        <Btn disabled={busy}>Add</Btn>
      </Row>
      <Err error={error} />
    </form>
  );
}

export function PartiesPage() {
  const parties = useLoad(() => api<{ parties: Party[] }>('GET', '/api/v1/parties'));
  const items = useLoad(() => api<{ items: Item[] }>('GET', '/api/v1/items'));

  return (
    <div>
      <Card title="Parties — customers & vendors">
        <PartyForm onDone={parties.reload} />
        <Err error={parties.error} />
        <Tbl
          head={['Name', 'Type', 'GSTIN', 'State', 'Receivable', 'Payable']}
          rows={(parties.data?.parties ?? []).map((p) => [
            p.name,
            <span key="t">
              {p.type.map((t) => (
                <Badge key={t} value={t} />
              ))}
            </span>,
            p.gstin ?? '—',
            p.placeOfSupplyStateCode,
            <Money key="r" paise={p.outstandingReceivablePaise} />,
            <Money key="p" paise={p.outstandingPayablePaise} />,
          ])}
        />
      </Card>
      <Card title="Items & services (GST 2.0 slabs: 0 / 5 / 18 / 40)">
        <ItemForm onDone={items.reload} />
        <Err error={items.error} />
        <Tbl
          head={['Name', 'Kind', 'HSN/SAC', 'GST rate']}
          rows={(items.data?.items ?? []).map((i) => [
            i.name,
            <Badge key="k" value={i.kind} />,
            i.sac ?? i.hsn ?? '—',
            `${i.gstRate}%`,
          ])}
        />
      </Card>
    </div>
  );
}
