import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { Modal } from './components/ui.jsx';

/* ---------- useAsync: tải dữ liệu theo deps ---------- */
export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef
      .current()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error) => alive && setState((s) => ({ ...s, loading: false, error })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) };
}

/* ---------- Dự án hiện tại ---------- */
const PROJECT_KEY = 'pm.currentProject';
const readStoredProject = () => {
  try {
    return Number(localStorage.getItem(PROJECT_KEY)) || null;
  } catch {
    return null;
  }
};

const ProjectCtx = createContext({
  projects: [],
  projectId: null,
  project: null,
  loaded: false,
  setProjectId: () => {},
  refreshProjects: () => {},
});

export function ProjectProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(readStoredProject);

  const refreshProjects = useCallback(() => {
    api
      .list('projects', { limit: 500, sort: 'name', order: 'asc' })
      .then((d) => setProjects(d.items))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const setProjectId = useCallback((id) => {
    setSelected(id);
    try {
      localStorage.setItem(PROJECT_KEY, String(id));
    } catch {
      // bỏ qua nếu trình duyệt chặn lưu trữ
    }
  }, []);

  // Dự án đã chọn không còn tồn tại -> chọn dự án đang chạy đầu tiên
  const projectId = projects.some((p) => p.id === selected)
    ? selected
    : ((projects.find((p) => p.status === 'active') ?? projects[0])?.id ?? null);
  const project = projects.find((p) => p.id === projectId) ?? null;

  return (
    <ProjectCtx.Provider value={{ projects, projectId, project, loaded, setProjectId, refreshProjects }}>
      {children}
    </ProjectCtx.Provider>
  );
}
export const useProject = () => useContext(ProjectCtx);

/* ---------- Lookup: danh sách dùng cho dropdown liên kết (theo dự án hiện tại) ---------- */
const EMPTY_LOOKUP = {
  projects: [],
  allMembers: [],
  members: [],
  meetings: [],
  tasks: [],
  testCases: [],
  documents: [],
  categories: [],
  milestones: [],
  people: [],
  modules: [],
};
const LookupCtx = createContext({ lookup: EMPTY_LOOKUP, refreshLookup: () => {} });

export function LookupProvider({ children }) {
  const { projectId } = useProject();
  const [lookup, setLookup] = useState(EMPTY_LOOKUP);
  const refreshLookup = useCallback(() => {
    api
      .lookup(projectId ? { project_id: projectId } : {})
      .then(setLookup)
      .catch(() => {});
  }, [projectId]);
  useEffect(() => {
    refreshLookup();
  }, [refreshLookup]);
  return <LookupCtx.Provider value={{ lookup, refreshLookup }}>{children}</LookupCtx.Provider>;
}
export const useLookup = () => useContext(LookupCtx);

/* ---------- Toast ---------- */
const ToastCtx = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- Hộp xác nhận trong trang (thay cho window.confirm) ---------- */
const ConfirmCtx = createContext(async () => false);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { message, confirmLabel, resolve }
  const confirm = useCallback(
    (message, { confirmLabel = 'Xoá' } = {}) => new Promise((resolve) => setState({ message, confirmLabel, resolve })),
    [],
  );
  const close = useCallback(
    (ok) => {
      state?.resolve(ok);
      setState(null);
    },
    [state],
  );
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal title="Xác nhận" onClose={() => close(false)}>
          <p className="confirm-text">{state.message}</p>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => close(false)}>
              Huỷ
            </button>
            <button type="button" className="btn btn-danger" autoFocus onClick={() => close(true)}>
              {state.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);
