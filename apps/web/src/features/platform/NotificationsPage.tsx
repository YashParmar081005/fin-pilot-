/** Notifications + preferences (§32 Phase 22). */
import { api } from '../../lib/api';
import { Badge, Btn, C, Card, Err, Tbl, dateStr, useLoad } from '../../lib/ui';

interface Notification {
  _id: string;
  event: string;
  title: string;
  body?: string;
  readAt: string | null;
  createdAt: string;
}
interface Prefs {
  channels: { inApp: boolean; email: boolean; whatsapp: boolean };
  events: Record<string, boolean>;
}

const KNOWN_EVENTS = ['invoice.overdue', 'gst.gstr1_due', 'gst.gstr3b_due'];

export function NotificationsPage() {
  const list = useLoad(() =>
    api<{ notifications: Notification[] }>('GET', '/api/v1/notifications'),
  );
  const prefs = useLoad(() => api<Prefs>('GET', '/api/v1/notifications/preferences'));

  async function markRead(ids: string[]) {
    await api('POST', '/api/v1/notifications/read', { ids });
    list.reload();
  }
  async function patchPrefs(body: Partial<Prefs>) {
    await api('PATCH', '/api/v1/notifications/preferences', body);
    prefs.reload();
  }

  const unread = (list.data?.notifications ?? []).filter((n) => !n.readAt);

  return (
    <div>
      <Card
        title={`Notifications · ${unread.length} unread`}
        actions={
          unread.length > 0 && (
            <Btn small kind="ghost" onClick={() => void markRead(unread.map((n) => n._id))}>
              Mark all read
            </Btn>
          )
        }
      >
        <Err error={list.error} />
        <Tbl
          head={['When', 'Event', 'Title', 'Status']}
          rows={(list.data?.notifications ?? []).map((n) => [
            dateStr(n.createdAt),
            <Badge key="e" value={n.event} />,
            <span key="t" style={{ fontWeight: n.readAt ? 400 : 600 }}>
              {n.title}
            </span>,
            n.readAt ? (
              <span style={{ color: C.muted, fontSize: '0.8rem' }}>read</span>
            ) : (
              <Btn small kind="ghost" onClick={() => void markRead([n._id])}>
                Mark read
              </Btn>
            ),
          ])}
        />
      </Card>
      <Card title="Preferences">
        <Err error={prefs.error} />
        {prefs.data && (
          <>
            <h4 style={{ color: C.muted, fontSize: '0.8rem', margin: '0 0 0.4rem' }}>Channels</h4>
            {(['inApp', 'email', 'whatsapp'] as const).map((channel) => (
              <label
                key={channel}
                style={{ display: 'block', fontSize: '0.9rem', marginBottom: 4 }}
              >
                <input
                  type="checkbox"
                  checked={prefs.data!.channels[channel]}
                  onChange={(e) =>
                    void patchPrefs({ channels: { [channel]: e.target.checked } as never })
                  }
                />{' '}
                {channel}
              </label>
            ))}
            <h4 style={{ color: C.muted, fontSize: '0.8rem', margin: '0.8rem 0 0.4rem' }}>
              Events
            </h4>
            {KNOWN_EVENTS.map((event) => (
              <label key={event} style={{ display: 'block', fontSize: '0.9rem', marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={prefs.data!.events[event] !== false}
                  onChange={(e) => void patchPrefs({ events: { [event]: e.target.checked } })}
                />{' '}
                {event}
              </label>
            ))}
          </>
        )}
      </Card>
    </div>
  );
}
