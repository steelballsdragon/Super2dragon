import { useState } from 'react';
import { allSaves, inspectStorage, syncLocalToCloud, useGame } from '../store/game';

/** Where this campaign's saves live, what this browser holds, and tools to recover or resend them. */
export function StorageDiagnostics() {
  const s = useGame();
  const [report, setReport] = useState<ReturnType<typeof inspectStorage> | null>(null);
  const [working, setWorking] = useState(false);
  const listed = allSaves(s);
  const cloudLine = s.cloud === 'on' ? `connected · ${s.cloudSaves.length} save${s.cloudSaves.length === 1 ? '' : 's'} in your claude.ai account`
    : s.cloud === 'connecting' ? 'connecting…' : 'not available here (only inside the claude.ai viewer, signed in)';
  return (
    <div className="space-y-2 text-[12px]">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-muted">Browser storage</dt><dd className={s.storageKept ? 'text-parchment-dim' : 'text-gold'}>{s.storageKept ? `kept · ${s.saves.length} save${s.saves.length === 1 ? '' : 's'}` : 'refused by this browser: saves vanish when the page closes'}</dd>
        <dt className="text-muted">Cloud saves</dt><dd className="text-parchment-dim">{cloudLine}</dd>
        <dt className="text-muted">All saves</dt><dd className="text-parchment-dim">{listed.length}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-ghost !min-h-8 !py-1" onClick={() => { s.refreshSaves(); setReport(inspectStorage()); }}>Scan this browser</button>
        {s.cloud === 'on' ? (
          <button className="btn btn-ghost !min-h-8 !py-1" disabled={working} onClick={() => { setWorking(true); void syncLocalToCloud().then((n) => s.toast(n ? `Sent ${n} save${n > 1 ? 's' : ''} to your account.` : 'Your account already has every save from this browser.', 'success')).finally(() => setWorking(false)); }}>{working ? 'Sending…' : 'Send all saves to my account'}</button>
        ) : null}
      </div>
      {report ? (
        <div className="card p-2">
          {report.entries.length ? (
            <ul className="space-y-0.5 font-mono text-[11px]">
              {report.entries.map((e) => {
                const id = e.key.startsWith('totw1800:save:') ? e.key.slice('totw1800:save:'.length) : null;
                return <li key={e.key} className="flex justify-between gap-2"><span className="truncate">{e.key}</span><span className="shrink-0 text-muted">{(e.chars * 2 / 1024).toFixed(0)} KB{id && !report.listed.includes(id) ? ' · unlisted' : ''}</span></li>;
              })}
            </ul>
          ) : <p className="text-muted">This browser holds nothing for the game{report.kept ? '' : ' (it refuses storage for this page)'}.</p>}
          <p className="mt-1.5 text-[11px] text-muted">A save made in another browser or app lives only there (and in your account, once cloud saves are on). Open the game there to bring it back.</p>
        </div>
      ) : null}
    </div>
  );
}
