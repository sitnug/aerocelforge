import { Clock3, FilePlus2, FolderOpen, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProjectSummary } from "../lib/native";

interface ProjectManagerDialogProps {
  readonly open: boolean;
  readonly projects: readonly ProjectSummary[];
  readonly activeFileName: string | null;
  readonly loading: boolean;
  readonly canClose: boolean;
  readonly onClose: () => void;
  readonly onCreate: (name: string) => Promise<void>;
  readonly onOpen: (fileName: string) => Promise<void>;
  readonly onDelete: (fileName: string) => Promise<void>;
}

function readableDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Saved date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function ProjectManagerDialog({
  open,
  projects,
  activeFileName,
  loading,
  canClose,
  onClose,
  onCreate,
  onOpen,
  onDelete
}: ProjectManagerDialogProps) {
  const [name, setName] = useState("");
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDeletingFile(null);
    window.setTimeout(() => nameRef.current?.focus(), 0);
  }, [open]);

  if (!open) return null;

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    setBusyFile(key);
    setError(null);
    try {
      await action();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyFile(null);
    }
  };

  const create = async (): Promise<void> => {
    const cleanName = name.trim();
    if (cleanName.length === 0) {
      setError("Give the new aircraft file a name first.");
      nameRef.current?.focus();
      return;
    }
    await run("__new__", async () => {
      await onCreate(cleanName);
      setName("");
    });
  };

  return (
    <div className="modal-backdrop project-manager-backdrop" role="presentation">
      <section
        className="project-manager"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-manager-title"
      >
        <header>
          <div className="project-manager__mark">
            <FolderOpen size={20} />
          </div>
          <span>
            <small>AEROCEL FORGE FILES</small>
            <h2 id="project-manager-title">Choose an aircraft file</h2>
            <p>Create an empty file or open one you already made.</p>
          </span>
          {canClose && (
            <button
              type="button"
              className="icon-button icon-button--quiet"
              onClick={onClose}
              aria-label="Close file manager"
            >
              <X size={18} />
            </button>
          )}
        </header>

        <div className="project-manager__body">
          <section className="new-project-card" aria-labelledby="new-project-title">
            <span className="new-project-card__icon">
              <FilePlus2 size={22} />
            </span>
            <div>
              <h3 id="new-project-title">New empty file</h3>
              <p>No sample plane and no made-up parts. You will import your own model next.</p>
              <div className="new-project-form">
                <label htmlFor="new-project-name">File name</label>
                <div>
                  <input
                    ref={nameRef}
                    id="new-project-name"
                    value={name}
                    maxLength={80}
                    placeholder="My aircraft"
                    disabled={busyFile !== null}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void create();
                    }}
                  />
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={busyFile !== null || name.trim() === ""}
                    onClick={() => void create()}
                  >
                    <FilePlus2 size={15} />
                    {busyFile === "__new__" ? "Creating…" : "Create file"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="project-library" aria-labelledby="saved-projects-title">
            <header>
              <span>
                <Clock3 size={15} />
                <h3 id="saved-projects-title">Your saved files</h3>
              </span>
              <small>{projects.length} total</small>
            </header>
            <div className="project-list">
              {loading ? (
                <div className="project-list__empty">Loading your files…</div>
              ) : projects.length === 0 ? (
                <div className="project-list__empty">
                  <FolderOpen size={24} />
                  <strong>No saved files yet</strong>
                  <span>Create an empty file above, then import your aircraft.</span>
                </div>
              ) : (
                projects.map((project) => {
                  const active = project.fileName === activeFileName;
                  const confirmingDelete = deletingFile === project.fileName;
                  return (
                    <article
                      className={`project-row ${active ? "project-row--active" : ""}`}
                      key={project.fileName}
                    >
                      <button
                        type="button"
                        className="project-row__open"
                        disabled={busyFile !== null}
                        onClick={() => void run(project.fileName, () => onOpen(project.fileName))}
                      >
                        <span className="project-row__file-icon">
                          <FolderOpen size={17} />
                        </span>
                        <span className="project-row__copy">
                          <strong>{project.name}</strong>
                          <small>
                            Revision {project.revision} · {readableDate(project.updatedAt)}
                          </small>
                        </span>
                        <span className="project-row__status">
                          {busyFile === project.fileName
                            ? "Opening…"
                            : active
                              ? "Open"
                              : "Open file"}
                        </span>
                      </button>
                      {confirmingDelete ? (
                        <div className="project-row__delete-confirm" role="alert">
                          <span>Delete this saved file?</span>
                          <button
                            type="button"
                            className="button button--quiet"
                            onClick={() => setDeletingFile(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="button button--danger"
                            disabled={busyFile !== null}
                            onClick={() =>
                              void run(`delete:${project.fileName}`, async () => {
                                await onDelete(project.fileName);
                                setDeletingFile(null);
                              })
                            }
                          >
                            Delete
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="project-row__delete"
                          aria-label={`Delete ${project.name}`}
                          title={
                            active ? "Open another file before deleting this one" : "Delete file"
                          }
                          disabled={busyFile !== null || active}
                          onClick={() => setDeletingFile(project.fileName)}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </section>
          {error !== null && (
            <div className="project-manager__error" role="alert">
              {error}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
