import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { FileChips } from '../components/Attachments.jsx';
import { Section } from '../components/DetailPage.jsx';
import { Badge, ErrorBox, Loading } from '../components/ui.jsx';
import { code, fmtDateTime, label } from '../constants.js';
import { useAsync } from '../context.jsx';

// Các bước của quy trình: chạy test -> (Không đạt) báo bug -> sửa bug -> test lại -> Đạt
const STEPS = ['Thực thi test', 'Báo bug', 'Sửa bug', 'Test lại', 'Đạt'];

/** Bước hiện tại (theo stage từ máy chủ) -> { active, done, tone, text } */
function stageInfo(stage, data) {
  const open = data.bugs.filter((b) => ['new', 'in_progress', 'reopened'].includes(b.status));
  const fixed = data.bugs.filter((b) => b.status === 'resolved');
  const list = (bugs) => bugs.map((b) => code('bugs', b.id)).join(', ');
  switch (stage) {
    case 'not_run':
      return { active: 0, tone: 'info', text: 'Chưa thực thi. Hãy chạy test và ghi nhận kết quả.' };
    case 'blocked':
      return { active: 0, tone: 'warn', text: 'Lần chạy gần nhất bị chặn. Xử lý điều kiện chặn rồi chạy lại.' };
    case 'report_bug':
      return { active: 1, tone: 'danger', text: 'Test Không đạt. Hãy báo bug để đội phát triển sửa.', action: 'bug' };
    case 'fixing':
      return { active: 2, tone: 'warn', text: `Đang chờ sửa ${open.length} bug: ${list(open)}.` };
    case 'retest':
      return { active: 3, tone: 'info', text: `Bug ${list(fixed)} đã sửa. Hãy test lại và cập nhật kết quả.`, action: 'retest' };
    case 'retest_passed_open':
      return { active: 4, done: true, tone: 'success', text: `Đạt. Bug ${list(fixed)} đã sửa nhưng chưa đóng.` };
    default:
      return {
        active: 4,
        done: true,
        tone: 'success',
        text: data.bugs.length ? 'Đạt sau khi sửa bug. Quy trình hoàn tất.' : 'Đạt ngay từ lần test đầu.',
      };
  }
}

/** Bước hiện tại của một test case trong danh sách (từ trạng thái + số bug mở / đã sửa) */
export function FlowStage({ tc }) {
  const [text, tone] =
    tc.status === 'not_run'
      ? ['Chưa chạy', 'gray']
      : tc.status === 'blocked'
        ? ['Bị chặn', 'amber']
        : tc.status === 'passed'
          ? [tc.fixed_bug_count ? 'Đạt · chưa đóng bug' : 'Hoàn tất', 'green']
          : tc.fixed_bug_count && !tc.open_bug_count
            ? ['Chờ test lại', 'blue']
            : tc.open_bug_count
              ? [`Đang sửa ${tc.open_bug_count} bug`, 'purple']
              : ['Cần báo bug', 'red'];
  return <span className={`badge badge-${tone} nowrap`}>{text}</span>;
}

/** Thanh các bước của quy trình test (đặt ở tab Chi tiết) */
export function TestFlowStepper({ data, onReportBug, onRetest }) {
  const info = stageInfo(data.stage, data);
  return (
    <section className={`card section test-flow tone-${info.tone}`}>
      <ol className="flow-steps">
        {STEPS.map((s, i) => {
          const state = i < info.active || (info.done && i === info.active) ? 'done' : i === info.active ? 'current' : '';
          return (
            <li key={s} className={state} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="flow-dot">{state === 'done' ? '✓' : i + 1}</span>
              <span className="flow-label">{s}</span>
            </li>
          );
        })}
      </ol>
      <div className="flow-hint">
        <span>{info.text}</span>
        {info.action === 'bug' && (
          <button className="btn btn-sm btn-danger" onClick={onReportBug}>
            + Báo bug
          </button>
        )}
        {info.action === 'retest' && (
          <button className="btn btn-sm btn-primary" onClick={onRetest}>
            Test lại
          </button>
        )}
      </div>
    </section>
  );
}

const STATUS_ICON = { new: '🐞', in_progress: '🔧', resolved: '🛠', closed: '🔒', reopened: '↩', rejected: '⛔' };

function EventBody({ e, reload }) {
  switch (e.type) {
    case 'created':
      return <strong>Tạo test case</strong>;
    case 'run':
      return (
        <>
          <div>
            <strong>{e.retest ? `Test lại (lần ${e.index})` : `Thực thi test lần ${e.index}`}</strong>{' '}
            <Badge kind="testStatus" value={e.result} />
          </div>
          {e.note && <div className="tl-note">{e.note}</div>}
          {e.attachments.length > 0 && <FileChips files={e.attachments} onChanged={reload} />}
        </>
      );
    case 'bug_created':
      return (
        <>
          <div>
            <strong>Báo bug</strong>{' '}
            <Link to={`/bugs/${e.bug.id}`}>
              {code('bugs', e.bug.id)} · {e.bug.title}
            </Link>{' '}
            <Badge kind="bugSeverity" value={e.bug.severity} />
          </div>
          {e.bug.assignee && <div className="muted small">PIC: {e.bug.assignee}</div>}
        </>
      );
    case 'bug_status':
      return (
        <>
          <div>
            <Link to={`/bugs/${e.bug.id}`}>{code('bugs', e.bug.id)}</Link>{' '}
            {e.from && (
              <>
                <Badge kind="bugStatus" value={e.from} /> →{' '}
              </>
            )}
            <Badge kind="bugStatus" value={e.to} />
          </div>
          {e.summary && <div className="muted small">{e.summary}</div>}
        </>
      );
    default:
      return null;
  }
}

const iconOf = (e) =>
  e.type === 'created'
    ? '＋'
    : e.type === 'run'
      ? e.result === 'passed'
        ? '✓'
        : e.result === 'failed'
          ? '✗'
          : '⊘'
      : e.type === 'bug_created'
        ? '🐞'
        : (STATUS_ICON[e.to] ?? '•');

const toneOf = (e) =>
  e.type === 'run'
    ? { passed: 'success', failed: 'danger', blocked: 'warn' }[e.result]
    : e.type === 'bug_created'
      ? 'danger'
      : e.type === 'bug_status'
        ? { resolved: 'success', closed: 'muted', reopened: 'danger', in_progress: 'info' }[e.to] ?? 'muted'
        : 'muted';

/** Dòng thời gian quy trình test: chạy test, báo bug, trạng thái bug, test lại */
export function TestTimeline({ data, reload }) {
  return (
    <Section title="Quy trình test theo thời gian">
      <ol className="timeline">
        {data.events.map((e, i) => (
          <li key={i} className={`tl-item tl-${e.type} tone-${toneOf(e)}`}>
            <span className="tl-icon" aria-hidden="true">
              {iconOf(e)}
            </span>
            <div className="tl-main">
              <div className="tl-meta muted small">
                {fmtDateTime(e.at)}
                {e.actor && ` · ${e.actor}`}
              </div>
              <EventBody e={e} reload={reload} />
            </div>
          </li>
        ))}
      </ol>
      <p className="muted small tl-legend">
        Quy trình: thực thi test → nếu {label('testStatus', 'failed')} thì báo bug → bug được sửa ({label('bugStatus', 'resolved')}) →
        test lại → {label('testStatus', 'passed')} thì đóng bug, {label('testStatus', 'failed')} thì mở lại bug.
      </p>
    </Section>
  );
}

/** Lấy dữ liệu dòng thời gian (tải lại khi test case thay đổi) */
export function useTimeline(tc) {
  return useAsync(() => api.testTimeline(tc.id), [tc.id, tc.updated_at, tc.runs.length, tc.bugs.map((b) => b.status).join()]);
}

export function TimelineTab({ tc, reload }) {
  const { data, error, reload: again } = useTimeline(tc);
  if (error) return <ErrorBox error={error} onRetry={again} />;
  if (!data) return <Loading />;
  return <TestTimeline data={data} reload={reload} />;
}
