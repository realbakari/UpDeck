import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@cloudflare/kumo/components/button';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import { Input } from '@cloudflare/kumo/components/input';
import {
  ArrowsClockwise,
  CheckCircle,
  Lightning,
  Link as LinkIcon,
  Plus,
  ShieldCheck,
  X,
} from '@phosphor-icons/react';
import { useBank } from '../bank-context';
import { publicHttpsUrl, type Operation, type Webhook, type WebhookLog } from '../api-model';

export function Connections() {
  const { call, demo } = useBank();
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [logsNext, setLogsNext] = useState<string | null>(null);
  const [selected, setSelected] = useState<Webhook | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState<{
    operation: Operation;
    title: string;
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [health, setHealth] = useState<string | null>(null);
  const epoch = useRef(0);
  async function list(cursor?: string) {
    const result = await call({ op: 'webhooks', cursor });
    if (result.kind === 'webhooks') {
      setHooks((old) => (cursor ? [...old, ...result.page.data] : result.page.data));
      setNext(result.page.links.next);
    }
  }
  useEffect(() => {
    let active = true;
    setBusy(true);
    void call({ op: 'webhooks' })
      .then((result) => {
        if (active && result.kind === 'webhooks') {
          setHooks(result.page.data);
          setNext(result.page.links.next);
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Couldn’t load webhooks. Try again.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      epoch.current++;
    };
  }, [call]);
  async function task(action: () => Promise<void>) {
    const version = epoch.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      if (version === epoch.current)
        setError(e instanceof Error ? e.message : 'Couldn’t finish that. Try again.');
    } finally {
      if (version === epoch.current) setBusy(false);
    }
  }
  async function inspect(id: string, cursor?: string) {
    await task(async () => {
      if (!cursor) {
        const detail = await call({ op: 'webhook', id });
        if (detail.kind === 'webhook')
          setSelected((previous) =>
            previous?.id === id && previous.attributes.secretKey
              ? {
                  ...detail.data,
                  attributes: {
                    ...detail.data.attributes,
                    secretKey: previous.attributes.secretKey,
                  },
                }
              : detail.data,
          );
        setLogs([]);
      }
      const history = await call({ op: 'webhookLogs', id, cursor });
      if (history.kind === 'webhookLogs') {
        setLogs((old) => (cursor ? [...old, ...history.page.data] : history.page.data));
        setLogsNext(history.page.links.next);
      }
    });
  }
  function prepareCreate(event: FormEvent) {
    event.preventDefault();
    const valid = publicHttpsUrl.safeParse(url.trim());
    if (!valid.success || url.length > 300) {
      setError('Use a public HTTPS endpoint up to 300 characters, with no embedded credentials.');
      return;
    }
    if (!acknowledged) return;
    setPending({
      operation: { op: 'createWebhook', url: valid.data, description, confirmed: true },
      title: 'Send Up events to this server?',
      text: `${valid.data} will receive transaction event identifiers and timestamps directly from Up, even when UpDeck is locked or closed. This creates a persistent webhook at your bank. ${demo ? 'In this demo, no network request is sent.' : ''}`,
    });
  }
  async function commit() {
    if (!pending) return;
    await task(async () => {
      const result = await call(pending.operation);
      if (result.kind === 'webhook') {
        setSelected(result.data);
        setLogs([]);
        setLogsNext(null);
        setCreateOpen(false);
        setUrl('');
        setDescription('');
        setAcknowledged(false);
        setNotice('Webhook created. Save the signing secret now; Up returns it only once.');
      } else if (result.kind === 'webhookEvent')
        setNotice(
          `Ping queued at ${new Date(result.data.attributes.createdAt).toLocaleTimeString('en-AU')}. Check the delivery logs for the result.`,
        );
      else if (pending.operation.op === 'deleteWebhook') {
        setSelected(null);
        setLogs([]);
        setNotice('Webhook deleted. Future events will no longer be sent to that endpoint.');
      }
      setPending(null);
      await list();
    });
  }
  return (
    <>
      <div className="connection-intro">
        <div>
          <span className="mini-label">
            <LinkIcon size={18} />
            Connect your own tools
          </span>
          <h2>Webhooks</h2>
          <p>
            Manage Up’s webhook subscriptions and inspect delivery logs. No UpDeck server sits in
            the middle.
          </p>
        </div>
        <Button
          className="primary-button"
          disabled={busy || hooks.length >= 10}
          onClick={() => {
            setError('');
            setCreateOpen(true);
          }}
        >
          <Plus size={17} />
          New webhook
        </Button>
      </div>
      <div className="health-panel panel">
        <span className="icon-circle green">
          <Lightning size={23} />
        </span>
        <div>
          <h3>Up API connection</h3>
          <p>{health ?? 'Check that your personal access token can reach Up.'}</p>
        </div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void task(async () => {
              const result = await call({ op: 'ping' });
              if (result.kind === 'ping')
                setHealth(
                  `${result.meta.statusEmoji} ${demo ? 'Demo connection' : 'Connected'} · checked ${new Date().toLocaleTimeString('en-AU')}`,
                );
            })
          }
        >
          Check connection
        </Button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-note" role="status">
          {notice}
        </p>
      )}
      <div className="section-heading">
        <h2>Your webhooks</h2>
        <span className="muted">{hooks.length} loaded · Up allows 10</span>
        <Button variant="ghost" disabled={busy} onClick={() => void task(() => list())}>
          <ArrowsClockwise size={16} />
          Refresh
        </Button>
      </div>
      <div className="webhook-list">
        {hooks.map((hook) => (
          <article className="panel webhook-card" key={hook.id}>
            <div>
              <h3>{hook.attributes.description || 'Untitled webhook'}</h3>
              <p className="endpoint-url">{hook.attributes.url}</p>
              <span className="muted">
                Created {new Date(hook.attributes.createdAt).toLocaleDateString('en-AU')}
              </span>
            </div>
            <div className="tile-actions">
              <Button variant="secondary" disabled={busy} onClick={() => void inspect(hook.id)}>
                Details & logs
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  setPending({
                    operation: { op: 'pingWebhook', id: hook.id, confirmed: true },
                    title: 'Send a test event?',
                    text: `Up will send a PING event to ${hook.attributes.url}. Delivery is asynchronous.`,
                  })
                }
              >
                Test
              </Button>
              <Button
                variant="secondary-destructive"
                disabled={busy}
                onClick={() =>
                  setPending({
                    operation: { op: 'deleteWebhook', id: hook.id, confirmed: true },
                    title: 'Delete this webhook?',
                    text: `Stop future events to ${hook.attributes.url}. Recreating it will generate a different signing secret.`,
                  })
                }
              >
                Delete
              </Button>
            </div>
          </article>
        ))}
      </div>
      {!hooks.length && (
        <div className="panel empty-state">
          <LinkIcon size={32} />
          <h3>No outgoing webhooks</h3>
          <p>Point Up at your own HTTPS server to get transaction events as they happen.</p>
        </div>
      )}
      {next && (
        <Button disabled={busy} onClick={() => void task(() => list(next))}>
          More webhooks
        </Button>
      )}
      <div className="plain-note">
        <ShieldCheck size={20} />A browser extension cannot receive public webhooks. Use a server
        you control. The included receiver example verifies Up’s HMAC signatures and stores events
        before acknowledging them.
      </div>
      <Dialog.Root
        open={createOpen}
        onOpenChange={(open) => {
          if (!busy) {
            setCreateOpen(open);
            if (!open) {
              setUrl('');
              setDescription('');
              setAcknowledged(false);
            }
          }
        }}
      >
        <Dialog className="deck-dialog" size="lg">
          <Dialog.Title>Connect your own endpoint</Dialog.Title>
          <Dialog.Description>
            Up sends transaction events to this URL until you delete the webhook. Only add a server
            you own and trust.
          </Dialog.Description>
          <form className="dialog-form" onSubmit={prepareCreate}>
            <Input
              label="HTTPS endpoint"
              type="url"
              required
              maxLength={300}
              placeholder="https://your-server.example/up/events"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Input
              label="Description"
              maxLength={64}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="My personal money tracker"
            />
            <label className="consent-check">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                required
              />
              I control this server and want Up to send it my transaction events.
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <p className="plain-note">
              The endpoint must validate X-Up-Authenticity-Signature and respond with HTTP 200. Up
              retries failed deliveries.
            </p>
            <div className="dialog-actions">
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="primary-button" disabled={!acknowledged || busy}>
                Review connection
              </Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>
      <Dialog.Root
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setSelected(null);
            setLogs([]);
            setNotice('');
          }
        }}
      >
        <Dialog className="deck-dialog" size="xl">
          <div className="dialog-title-row">
            <Dialog.Title>{selected?.attributes.description || 'Webhook details'}</Dialog.Title>
            <Button
              aria-label="Close webhook details"
              variant="ghost"
              shape="square"
              onClick={() => {
                setSelected(null);
                setLogs([]);
                setNotice('');
              }}
            >
              <X size={20} />
            </Button>
          </div>
          <Dialog.Description>{selected?.attributes.url ?? ''}</Dialog.Description>
          {selected?.attributes.secretKey && (
            <div className="secret-panel">
              <h3>
                <CheckCircle size={19} />
                Save your signing secret
              </h3>
              <p>
                This is the only time Up returns this secret. It is cleared when you close this view
                or lock UpDeck. Store it securely on your receiver server.
              </p>
              <Input
                aria-label="Webhook signing secret"
                type="password"
                readOnly
                value={selected.attributes.secretKey}
              />
              <Button
                variant="secondary"
                onClick={() => {
                  if (selected.attributes.secretKey)
                    void navigator.clipboard
                      .writeText(selected.attributes.secretKey)
                      .then(() =>
                        setNotice('Signing secret copied. Clear your clipboard after saving it.'),
                      )
                      .catch(() =>
                        setError(
                          'Clipboard unavailable. Select and copy the secret field manually.',
                        ),
                      );
                }}
              >
                Copy signing secret
              </Button>
            </div>
          )}
          {notice && (
            <p className="success-note" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <dl className="detail-grid">
            <dt>Webhook ID</dt>
            <dd>{selected?.id}</dd>
            <dt>Created</dt>
            <dd>
              {selected ? new Date(selected.attributes.createdAt).toLocaleString('en-AU') : ''}
            </dd>
          </dl>
          <div className="section-heading">
            <h3>Delivery logs</h3>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (selected) void inspect(selected.id);
              }}
            >
              Refresh logs
            </Button>
          </div>
          {!logs.length && (
            <p className="plain-note">
              No delivery logs loaded. Pings are asynchronous; refresh after a test. Old logs may be
              purged by Up.
            </p>
          )}
          {logs.map((log) => (
            <details className="delivery-log" key={log.id}>
              <summary>
                {log.attributes.deliveryStatus} ·{' '}
                {new Date(log.attributes.createdAt).toLocaleString('en-AU')} · HTTP{' '}
                {log.attributes.response?.statusCode ?? 'no response'}
              </summary>
              <h4>Request body</h4>
              <pre>{log.attributes.request.body}</pre>
              <h4>Response body</h4>
              <pre>{log.attributes.response?.body ?? 'No response'}</pre>
              <p>Event {log.relationships.webhookEvent.data?.id}</p>
            </details>
          ))}
          {logsNext && selected && (
            <Button disabled={busy} onClick={() => void inspect(selected.id, logsNext)}>
              Older delivery logs
            </Button>
          )}
        </Dialog>
      </Dialog.Root>
      <Dialog.Root
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null);
        }}
      >
        <Dialog className="deck-dialog">
          <Dialog.Title>{pending?.title ?? ''}</Dialog.Title>
          <Dialog.Description>{pending?.text ?? ''}</Dialog.Description>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Button variant="secondary" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button className="primary-button" disabled={busy} onClick={() => void commit()}>
              {busy ? 'Working…' : 'Confirm'}
            </Button>
          </div>
        </Dialog>
      </Dialog.Root>
    </>
  );
}
