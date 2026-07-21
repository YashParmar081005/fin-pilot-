/** Trial balance with per-account drill (§32 Phase 5/17). */
import { useState } from 'react';
import { api, qs } from '../../lib/api';
import { Card, Err, Field, Money, Row, S, Tbl, Btn, C, useLoad, today } from '../../lib/ui';

interface TbRow {
  accountId: string;
  code: string;
  name: string;
  type: string;
  debitPaise: number;
  creditPaise: number;
  balancePaise: number;
}

export function TrialBalancePage() {
  const [asOf, setAsOf] = useState(today());
  const { data, error, reload } = useLoad(
    () => api<{ rows: TbRow[] }>('GET', `/api/v1/reports/trial-balance${qs({ asOf })}`),
    [asOf],
  );

  const rows = data?.rows ?? [];
  const totalDr = rows.reduce((sum, r) => sum + r.debitPaise, 0);
  const totalCr = rows.reduce((sum, r) => sum + r.creditPaise, 0);

  return (
    <Card
      title="Trial balance"
      actions={
        <Row>
          <Field label="As of">
            <input
              style={{ ...S.input, margin: 0 }}
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </Field>
          <Btn small onClick={reload}>
            Refresh
          </Btn>
        </Row>
      }
    >
      <Err error={error} />
      <Tbl
        head={['Code', 'Account', 'Type', 'Debit', 'Credit']}
        rows={[
          ...rows.map((r) => [
            r.code,
            r.name,
            r.type,
            <Money key="d" paise={r.debitPaise} />,
            <Money key="c" paise={r.creditPaise} />,
          ]),
          [
            <b key="t">TOTAL</b>,
            '',
            '',
            <b key="d">
              <Money paise={totalDr} />
            </b>,
            <b key="c">
              <Money paise={totalCr} />
            </b>,
          ],
        ]}
      />
      {rows.length > 0 && (
        <p
          style={{
            color: totalDr === totalCr ? C.green : C.red,
            fontSize: '0.85rem',
            marginBottom: 0,
          }}
        >
          {totalDr === totalCr
            ? '✓ Debits equal credits (I2)'
            : '✗ OUT OF BALANCE — page the on-call'}
        </p>
      )}
    </Card>
  );
}
