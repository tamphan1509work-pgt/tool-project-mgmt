import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import DetailPage, { InfoList, LinkedList, Section } from '../components/DetailPage.jsx';
import EntityForm from '../components/EntityForm.jsx';
import ResourceList from '../components/ResourceList.jsx';
import { Badge, Modal, Prose } from '../components/ui.jsx';
import { code, fmtDateTime, label, options } from '../constants.js';
import { useConfirm, useLookup, useToast } from '../context.jsx';
import { bugFields, testCaseFields } from '../forms.js';

export function TestCaseList() {
  return (
    <ResourceList
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
        { key: 'priority', title: 'Ưu tiên', sort: 'priority', width: 120, render: (t) => <Badge kind="priority" value={t.priority} /> },
        { key: 'status', title: 'Kết quả', sort: 'status', width: 120, render: (t) => <Badge kind="testStatus" value={t.status} /> },
        { key: 'last_run_at', title: 'Chạy lần cuối', sort: 'last_run_at', width: 140, className: 'muted small', render: (t) => fmtDateTime(t.last_run_at) },
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

  const run = async (result) => {
    setBusy(true);
    try {
      try {
        if (by) localStorage.setItem('pm.tester', by);
      } catch {
        // bỏ qua nếu trình duyệt chặn lưu trữ
      }
      const r = await api.addRun(tc.id, { result, note, executed_by: by });
      toast(`Đã ghi nhận: ${label('testStatus', result)}`, result === 'passed' ? 'success' : 'warn');
      setNote('');
      reload();
      refreshLookup();
      if (result === 'failed') onFailed(r);
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
        <div className="run-actions">
          <input
            placeholder="Người thực hiện"
            list="run-people"
            value={by}
            onChange={(e) => setBy(e.target.value)}
          />
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
        <table className="table compact">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Thời điểm</th>
              <th style={{ width: 110 }}>Kết quả</th>
              <th style={{ width: 150 }}>Người chạy</th>
              <th>Ghi chú</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {tc.runs.map((r) => (
              <tr key={r.id}>
                <td className="small">{fmtDateTime(r.executed_at)}</td>
                <td>
                  <Badge kind="testStatus" value={r.result} />
                </td>
                <td>{r.executed_by}</td>
                <td className="prose">{r.note}</td>
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
    test_case_id: tc.id,
    task_id: tc.task_id,
    steps_to_reproduce: [tc.preconditions && `Điều kiện: ${tc.preconditions}`, tc.steps].filter(Boolean).join('\n'),
    expected_result: tc.expected_result,
    actual_result: run?.note ?? '',
  });

  const createBug = async (values) => {
    const bug = await api.create('bugs', values);
    toast(`Đã tạo ${code('bugs', bug.id)}`);
    setBugDraft(null);
    refreshLookup();
    navigate(`/bugs/${bug.id}`);
  };

  return (
    <DetailPage
      resource="test-cases"
      backLabel="Danh sách test case"
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
