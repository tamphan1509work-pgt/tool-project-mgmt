import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { AddFilesButton, FileChips, FilePicker, uploadFiles, useUploadLimit } from '../components/Attachments.jsx';
import DetailPage, { InfoList, LinkedList, Section } from '../components/DetailPage.jsx';
import EntityForm from '../components/EntityForm.jsx';
import ResourceList, { useParamSetter } from '../components/ResourceList.jsx';
import { Badge, ErrorBox, Modal, Prose } from '../components/ui.jsx';
import { code, fmtDateTime, label, options } from '../constants.js';
import { useAsync, useConfirm, useLookup, useProject, useToast } from '../context.jsx';
import { bugFields, testCaseFields } from '../forms.js';

const pct = (v) => (v == null ? '—' : `${v}%`);

/** Bảng tổng hợp theo một chiều (module / độ ưu tiên / loại test) */
function BreakdownTable({ title, rows, renderKey, total }) {
  return (
    <section className="card section">
      <div className="section-head">
        <h3>{title}</h3>
      </div>
      <div className="table-wrap">
        <table className="table compact report-table">
          <thead>
            <tr>
              <th className="col-stt">STT</th>
              <th>{title.replace('Theo ', '').replace(/^./, (c) => c.toUpperCase())}</th>
              <th className="num">Tổng</th>
              <th className="num">Đạt</th>
              <th className="num">Không đạt</th>
              <th className="num">Bị chặn</th>
              <th className="num">Chưa chạy</th>
              <th className="num">Tiến độ</th>
              <th className="num">Tỉ lệ đạt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={renderKey(m, true)}>
                <td className="col-stt">{i + 1}</td>
                <td>{renderKey(m)}</td>
                <td className="num">{m.total}</td>
                <td className="num text-success">{m.passed}</td>
                <td className={`num ${m.failed ? 'text-danger' : ''}`}>{m.failed}</td>
                <td className="num">{m.blocked}</td>
                <td className="num muted">{m.not_run}</td>
                <td className="num">{pct(m.progress)}</td>
                <td className="num">
                  <strong>{pct(m.pass_rate)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
          {total && (
            <tfoot>
              <tr>
                <td />
                <td>
                  <strong>Tổng cộng</strong>
                </td>
                <td className="num">{total.total}</td>
                <td className="num">{total.passed}</td>
                <td className="num">{total.failed}</td>
                <td className="num">{total.blocked}</td>
                <td className="num">{total.not_run}</td>
                <td className="num">{pct(total.progress)}</td>
                <td className="num">
                  <strong>{pct(total.pass_rate)}</strong>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

/** Tab "Thống kê" của Test report */
function ReportStats() {
  const { projectId } = useProject();
  const { data, error, reload } = useAsync(() => api.testReport({ project_id: projectId }), [projectId]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <div className="muted pad">Đang tải…</div>;
  const s = data.summary;
  const seg = (n, tone, text) =>
    n > 0 && <div className={`seg seg-${tone}`} style={{ flexGrow: n }} title={`${text}: ${n}`} />;
  if (!s.total) return <div className="empty">Dự án chưa có test case nào để thống kê.</div>;
  return (
    <div className="report-stats">
      <section className="card section report">
        <div className="report-head">
          <div className="report-kpis">
            <div>
              <div className="report-kpi">{pct(s.pass_rate)}</div>
              <div className="muted small">Tỉ lệ đạt (trên số đã chạy)</div>
            </div>
            <div>
              <div className="report-kpi">{pct(s.progress)}</div>
              <div className="muted small">
                Tiến độ thực thi ({s.executed}/{s.total})
              </div>
            </div>
            <div>
              <div className={`report-kpi ${s.failed ? 'text-danger' : ''}`}>{s.failed}</div>
              <div className="muted small">Test case không đạt</div>
            </div>
            <div>
              <div className={`report-kpi ${data.openBugsFromTests ? 'text-danger' : ''}`}>
                {data.openBugsFromTests}
              </div>
              <div className="muted small">Bug mở từ test</div>
            </div>
          </div>
          <div className="muted small">Lần chạy gần nhất: {fmtDateTime(data.lastRun) || '—'}</div>
        </div>
        <div className="dist-bar">
          {seg(s.passed, 'green', 'Đạt')}
          {seg(s.failed, 'red', 'Không đạt')}
          {seg(s.blocked, 'amber', 'Bị chặn')}
          {seg(s.not_run, 'gray', 'Chưa chạy')}
        </div>
        <ul className="dist-legend">
          {[
            ['passed', s.passed],
            ['failed', s.failed],
            ['blocked', s.blocked],
            ['not_run', s.not_run],
          ].map(([k, n]) => (
            <li key={k}>
              <Link to={`/test-cases?status=${k}`}>
                <span
                  className={`dot seg-${{ passed: 'green', failed: 'red', blocked: 'amber', not_run: 'gray' }[k]}`}
                />
                {label('testStatus', k)} <strong>{n}</strong>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <BreakdownTable title="Theo module" rows={data.byModule} renderKey={(m) => m.module} total={s} />
      <BreakdownTable
        title="Theo độ ưu tiên"
        rows={data.byPriority}
        renderKey={(m, raw) => (raw ? m.key : <Badge kind="priority" value={m.key} />)}
      />
      <BreakdownTable
        title="Theo loại test"
        rows={data.byType}
        renderKey={(m, raw) => (raw ? m.key : label('testType', m.key))}
      />

      <div className="grid-2">
        <section className="card section">
          <div className="section-head">
            <h3>Theo người thực hiện</h3>
          </div>
          {data.byTester.length === 0 ? (
            <div className="muted">Chưa có lần chạy nào.</div>
          ) : (
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th className="col-stt">STT</th>
                    <th>Người chạy</th>
                    <th className="num">Lượt chạy</th>
                    <th className="num">Đạt</th>
                    <th className="num">Không đạt</th>
                    <th className="num">Bị chặn</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byTester.map((t, i) => (
                    <tr key={t.key}>
                      <td className="col-stt">{i + 1}</td>
                      <td>{t.key}</td>
                      <td className="num">{t.runs}</td>
                      <td className="num text-success">{t.passed}</td>
                      <td className={`num ${t.failed ? 'text-danger' : ''}`}>{t.failed}</td>
                      <td className="num">{t.blocked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card section">
          <div className="section-head">
            <h3>Lần chạy gần đây</h3>
          </div>
          {data.recentRuns.length === 0 ? (
            <div className="muted">Chưa có lần chạy nào.</div>
          ) : (
            <ul className="linked-list">
              {data.recentRuns.map((r) => (
                <li key={r.id}>
                  <Link to={`/test-cases/${r.test_case_id}`}>
                    <span className="mono">{code('test-cases', r.test_case_id)}</span> {r.title}
                  </Link>
                  <span className="linked-meta">
                    {r.attachment_count > 0 && <span title="File đính kèm">📎 {r.attachment_count}</span>}
                    <Badge kind="testStatus" value={r.result} />
                    <span className="muted small">{fmtDateTime(r.executed_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

const REPORT_TABS = [
  { value: '', label: 'Danh sách test case' },
  { value: 'stats', label: 'Thống kê' },
];

export function TestCaseList() {
  const [params, setParam] = useParamSetter();
  const tab = params.get('tab') ?? '';
  return (
    <>
      <div className="tabs" role="tablist">
        {REPORT_TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            className={tab === t.value ? 'active' : ''}
            onClick={() => setParam('tab', t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'stats' ? <ReportStats /> : <TestCaseTable />}
    </>
  );
}

function TestCaseTable() {
  return (
    <ResourceList
      persistentParams={['tab']}
      resource="test-cases"
      noun="test case"
      formFields={testCaseFields}
      searchPlaceholder="Tìm theo tên, module, các bước, mã…"
      filters={[
        { name: 'status', label: 'Kết quả', options: options('testStatus') },
        { name: 'priority', label: 'Ưu tiên', options: options('priority') },
        { name: 'type', label: 'Loại', options: options('testType') },
        { name: 'module', label: 'Module', source: 'modules' },
      ]}
      columns={[
        { key: 'title', title: 'Tên test case', sort: 'title', render: (t) => <strong>{t.title}</strong> },
        { key: 'module', title: 'Module', sort: 'module', width: 140 },
        { key: 'type', title: 'Loại', width: 110, render: (t) => label('testType', t.type) },
        {
          key: 'priority',
          title: 'Ưu tiên',
          sort: 'priority',
          width: 120,
          render: (t) => <Badge kind="priority" value={t.priority} />,
        },
        {
          key: 'status',
          title: 'Kết quả',
          sort: 'status',
          width: 120,
          render: (t) => <Badge kind="testStatus" value={t.status} />,
        },
        {
          key: 'last_run_at',
          title: 'Chạy lần cuối',
          sort: 'last_run_at',
          width: 140,
          className: 'muted small',
          render: (t) => fmtDateTime(t.last_run_at),
        },
      ]}
    />
  );
}

function RunPanel({ tc, reload, onFailed }) {
  const toast = useToast();
  const { lookup, refreshLookup } = useLookup();
  const [note, setNote] = useState('');
  const [by, setBy] = useState(() => {
    try {
      return localStorage.getItem('pm.tester') ?? '';
    } catch {
      return '';
    }
  });
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState([]);
  const maxBytes = useUploadLimit();

  const run = async (result) => {
    setBusy(true);
    try {
      try {
        if (by) localStorage.setItem('pm.tester', by);
      } catch {
        // bỏ qua nếu trình duyệt chặn lưu trữ
      }
      const r = await api.addRun(tc.id, { result, note, executed_by: by });
      // Tải file bằng chứng (ảnh chụp màn hình, log…) gắn vào lần chạy vừa tạo
      const ok = files.filter((f) => f.size <= maxBytes);
      const { uploaded, errors } = await uploadFiles('test-runs', r.id, ok);
      for (const e of errors) toast(e, 'error');
      toast(
        `Đã ghi nhận: ${label('testStatus', result)}${uploaded ? ` · ${uploaded} file đính kèm` : ''}`,
        result === 'passed' ? 'success' : 'warn',
      );
      setNote('');
      setFiles([]);
      reload();
      refreshLookup();
      if (result === 'failed') onFailed({ ...r, attachmentNames: ok.map((f) => f.name) });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Thực thi test">
      <div className="run-panel">
        <textarea
          rows={2}
          placeholder="Ghi chú kết quả (tuỳ chọn)…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <FilePicker compact value={files} onChange={setFiles} />
        <div className="run-actions">
          <input placeholder="Người thực hiện" list="run-people" value={by} onChange={(e) => setBy(e.target.value)} />
          <datalist id="run-people">
            {lookup.people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <button className="btn btn-success" disabled={busy} onClick={() => run('passed')}>
            ✓ Đạt
          </button>
          <button className="btn btn-danger" disabled={busy} onClick={() => run('failed')}>
            ✗ Không đạt
          </button>
          <button className="btn btn-warn" disabled={busy} onClick={() => run('blocked')}>
            ⊘ Bị chặn
          </button>
        </div>
      </div>
    </Section>
  );
}

function RunHistory({ tc, reload }) {
  const toast = useToast();
  const confirm = useConfirm();
  const remove = async (run) => {
    if (!(await confirm('Xoá lần chạy này?'))) return;
    try {
      await api.removeRun(run.id);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  return (
    <Section title={`Lịch sử chạy (${tc.runs.length})`}>
      {tc.runs.length === 0 ? (
        <div className="muted">Chưa chạy lần nào</div>
      ) : (
        <div className="table-wrap">
          <table className="table compact run-table">
            <thead>
              <tr>
                <th className="col-stt">STT</th>
                <th style={{ width: 120 }}>Thời điểm</th>
                <th style={{ width: 100 }}>Kết quả</th>
                <th style={{ width: 120 }}>Người chạy</th>
                <th>Ghi chú</th>
                <th style={{ width: 210 }}>File đính kèm</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {tc.runs.map((r, i) => (
                <tr key={r.id}>
                  <td className="col-stt">{i + 1}</td>
                  <td className="small">{fmtDateTime(r.executed_at)}</td>
                  <td>
                    <Badge kind="testStatus" value={r.result} />
                  </td>
                  <td>{r.executed_by}</td>
                  <td className="prose">{r.note}</td>
                  <td>
                    <FileChips files={r.attachments} onChanged={reload} />
                    <AddFilesButton target="test-runs" id={r.id} onDone={reload} label="Thêm" />
                  </td>
                  <td>
                    <button className="icon-btn danger" title="Xoá" onClick={() => remove(r)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

export function TestCaseDetail() {
  const navigate = useNavigate();
  const toast = useToast();
  const { refreshLookup } = useLookup();
  const [bugDraft, setBugDraft] = useState(null);

  const draftFrom = (tc, run) => ({
    title: `[${code('test-cases', tc.id)}] ${tc.title}`,
    severity: tc.priority === 'critical' ? 'critical' : 'major',
    priority: tc.priority,
    status: 'new',
    reporter: run?.executed_by ?? '',
    project_id: tc.project_id,
    test_case_id: tc.id,
    task_id: tc.task_id,
    steps_to_reproduce: [tc.preconditions && `Điều kiện: ${tc.preconditions}`, tc.steps].filter(Boolean).join('\n'),
    expected_result: tc.expected_result,
    actual_result: [
      run?.note,
      (run?.attachmentNames ?? run?.attachments?.map((a) => a.name) ?? []).length
        ? `Bằng chứng đính kèm ở lần chạy test: ${(run.attachmentNames ?? run.attachments.map((a) => a.name)).join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  const createBug = async (values) => {
    const bug = await api.create('bugs', { ...values, project_id: bugDraft.project_id });
    toast(`Đã tạo ${code('bugs', bug.id)}`);
    setBugDraft(null);
    refreshLookup();
    navigate(`/bugs/${bug.id}`);
  };

  return (
    <DetailPage
      resource="test-cases"
      backLabel="Test report"
      formFields={testCaseFields}
      badges={(tc) => (
        <>
          <Badge kind="testStatus" value={tc.status} />
          <Badge kind="priority" value={tc.priority} />
        </>
      )}
      actions={(tc) => (
        <button className="btn" onClick={() => setBugDraft(draftFrom(tc, tc.runs[0]))}>
          + Báo bug
        </button>
      )}
    >
      {(tc, { reload }) => (
        <>
          <div className="detail-grid">
            <div className="detail-main">
              <RunPanel tc={tc} reload={reload} onFailed={(run) => setBugDraft(draftFrom(tc, run))} />
              <Section title="Điều kiện tiên quyết">
                <Prose text={tc.preconditions} />
              </Section>
              <Section title="Các bước thực hiện">
                <Prose text={tc.steps} />
              </Section>
              <Section title="Kết quả mong đợi">
                <Prose text={tc.expected_result} />
              </Section>
              <RunHistory tc={tc} reload={reload} />
            </div>
            <aside className="detail-side">
              <Section title="Thông tin">
                <InfoList
                  items={[
                    ['Module', tc.module],
                    ['Loại', label('testType', tc.type)],
                    ['Chạy lần cuối', fmtDateTime(tc.last_run_at)],
                    [
                      'Task',
                      tc.task && (
                        <Link to={`/tasks/${tc.task.id}`}>
                          {code('tasks', tc.task.id)} · {tc.task.title}
                        </Link>
                      ),
                    ],
                  ]}
                />
              </Section>
              <Section title={`Bug liên quan (${tc.bugs.length})`}>
                <LinkedList
                  resource="bugs"
                  items={tc.bugs}
                  render={(b) => <Badge kind="bugStatus" value={b.status} />}
                  empty="Không có bug"
                />
              </Section>
            </aside>
          </div>
          {bugDraft && (
            <Modal wide title="Báo bug từ test case" onClose={() => setBugDraft(null)}>
              <EntityForm
                fields={bugFields}
                initial={bugDraft}
                onSubmit={createBug}
                onCancel={() => setBugDraft(null)}
                submitLabel="Tạo bug"
              />
            </Modal>
          )}
        </>
      )}
    </DetailPage>
  );
}
