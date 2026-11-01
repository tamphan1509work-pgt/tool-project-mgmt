import Attachments, { useUploader } from '../components/Attachments.jsx';
import { PersonAvatar } from '../components/Avatar.jsx';
import CategoryBadge from '../components/CategoryBadge.jsx';
import { categoryFilter } from '../categories.js';
import DetailPage, { InfoList, LinkedList, Section } from '../components/DetailPage.jsx';
import ResourceList, { useParamSetter } from '../components/ResourceList.jsx';
import { Badge, Prose } from '../components/ui.jsx';
import { fmtDateTime, options } from '../constants.js';
import { documentFields } from '../forms.js';

const TABS = [
  { value: '', label: 'Tất cả tài liệu' },
  { value: 'design', label: 'Thiết kế' },
  { value: 'specification', label: 'Tài liệu đặc tả' },
];

/** Link mở tài liệu ở tab mới (không mở trang chi tiết khi bấm trong bảng) */
export function DocLink({ url, children = 'Mở ↗' }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="doc-link" onClick={(e) => e.stopPropagation()}>
      {children}
    </a>
  );
}

export function DocumentList() {
  const upload = useUploader();
  const [params, setParam] = useParamSetter();
  const type = params.get('type') ?? '';
  return (
    <>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={type === t.value}
            className={type === t.value ? 'active' : ''}
            onClick={() => setParam('type', t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ResourceList
        resource="documents"
        onFiles={(doc, files) => upload('documents', doc.id, files)}
        noun={type === 'design' ? 'tài liệu thiết kế' : type === 'specification' ? 'tài liệu đặc tả' : 'tài liệu'}
        formFields={documentFields}
        defaultValues={type ? { type } : undefined}
        persistentParams={['type']}
        searchPlaceholder="Tìm theo tên, mô tả, người tạo, phiên bản…"
        filters={[
          { name: 'status', label: 'Trạng thái', options: options('documentStatus') },
          { name: 'created_by', label: 'Người tạo', source: 'people' },
          categoryFilter,
        ]}
        columns={[
          { key: 'title', title: 'Tên tài liệu', sort: 'title', render: (d) => <strong>{d.title}</strong> },
          ...(type
            ? []
            : [
                {
                  key: 'type',
                  title: 'Loại',
                  sort: 'type',
                  width: 140,
                  render: (d) => <Badge kind="documentType" value={d.type} />,
                },
              ]),
          {
            key: 'version',
            title: 'Phiên bản',
            sort: 'version',
            width: 90,
            render: (d) => d.version && `v${d.version}`,
          },
          {
            key: 'status',
            title: 'Trạng thái',
            sort: 'status',
            width: 130,
            render: (d) => <Badge kind="documentStatus" value={d.status} />,
          },
          { key: 'category_id', title: 'Danh mục', width: 150, render: (r) => <CategoryBadge id={r.category_id} /> },
          {
            key: 'created_by',
            title: 'Người tạo',
            sort: 'created_by',
            width: 90,
            render: (d) => <PersonAvatar name={d.created_by} />,
          },
          { key: 'task_count', title: 'Task liên kết', width: 100, className: 'num' },
          {
            key: 'url',
            title: 'Link / File',
            width: 110,
            render: (d) => (
              <span className="doc-sources">
                <DocLink url={d.url} />
                {d.attachment_count > 0 && (
                  <span className="badge badge-gray" title={`${d.attachment_count} file đính kèm`}>
                    📎 {d.attachment_count}
                  </span>
                )}
              </span>
            ),
          },
        ]}
      />
    </>
  );
}

export function DocumentDetail() {
  const upload = useUploader();
  return (
    <DetailPage
      resource="documents"
      onFiles={(doc, files) => upload('documents', doc.id, files)}
      backLabel="Danh sách tài liệu"
      historyTab
      formFields={documentFields}
      badges={(d) => (
        <>
          <Badge kind="documentType" value={d.type} />
          <Badge kind="documentStatus" value={d.status} />
          {d.version && <span className="badge badge-gray">v{d.version}</span>}
        </>
      )}
      actions={(d) =>
        d.url && (
          <a className="btn btn-primary" href={d.url} target="_blank" rel="noopener noreferrer">
            Mở tài liệu ↗
          </a>
        )
      }
    >
      {(d, { reload }) => (
        <div className="detail-grid">
          <div className="detail-main">
            <Section title="Mô tả / Tóm tắt nội dung">
              <Prose text={d.description} placeholder="Chưa có mô tả" />
            </Section>
            <Attachments record={d} target="documents" title="File đính kèm" reload={reload} />
            <Section title={`Task sử dụng tài liệu này (${d.tasks.length})`}>
              <LinkedList
                resource="tasks"
                items={d.tasks}
                render={(t) => (
                  <>
                    {t.assignee && <span className="muted">{t.assignee}</span>}
                    <Badge kind="taskStatus" value={t.status} />
                  </>
                )}
                empty="Chưa có task nào liên kết. Mở một task, bấm Sửa và chọn tài liệu này."
              />
            </Section>
          </div>
          <aside className="detail-side">
            <Section title="Thông tin">
              <InfoList
                items={[
                  ['Danh mục', <CategoryBadge key="c" id={d.category_id} full />],
                  ['Người tạo', d.created_by && <PersonAvatar key="p" name={d.created_by} showName />],
                  ['Thời gian tạo', fmtDateTime(d.created_at)],
                  ['Phiên bản', d.version && `v${d.version}`],
                  ['Link bên ngoài', d.url && <DocLink url={d.url}>{d.url}</DocLink>],
                  ['Cập nhật', fmtDateTime(d.updated_at)],
                ]}
              />
            </Section>
          </aside>
        </div>
      )}
    </DetailPage>
  );
}
