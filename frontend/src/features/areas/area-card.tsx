import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, MapPin, Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { Area } from "../../types/area.types";
import type { Section } from "../../types/section.types";

type Props = {
  area: Area;
  sections: Section[];
  canEdit: boolean;
  canDelete: boolean;
  canAddSection: boolean;
  onEditArea: () => void;
  onDeleteArea: () => void;
  onAddSection: () => void;
  onEditSection: (section: Section) => void;
  onDeleteSection: (section: Section) => void;
};

export function AreaCard({
  area,
  sections,
  canEdit,
  canDelete,
  canAddSection,
  onEditArea,
  onDeleteArea,
  onAddSection,
  onEditSection,
  onDeleteSection
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sectionMenuId, setSectionMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!menuOpen && !sectionMenuId) return;
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setSectionMenuId(null);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen, sectionMenuId]);

  return (
    <div className="bg-surface-panel border border-surface-border rounded-xl p-5 space-y-4" ref={menuRef}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate(`/cameras?areaId=${area._id}`)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigate(`/cameras?areaId=${area._id}`);
            }
          }}
          title={`Lihat kamera di ${area.name}`}
          className="flex items-center gap-3 min-w-0 -m-1 p-1 rounded-lg cursor-pointer group/area hover:bg-surface-elevated transition-colors"
        >
          <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-content truncate group-hover/area:text-primary transition-colors">
              {area.name}
            </p>
            <p className="text-[11px] font-mono text-content-muted">{area.code}</p>
          </div>
        </div>

        {(canEdit || canDelete) && (
          <div className="relative flex-shrink-0">
            <button
              onClick={() => {
                setMenuOpen((v) => !v);
                setSectionMenuId(null);
              }}
              className="p-1.5 rounded-md text-content-muted hover:text-content hover:bg-surface-elevated transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-surface-elevated border border-surface-border rounded-lg shadow-lg overflow-hidden z-10">
                {canEdit && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onEditArea();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-content hover:bg-surface-panel transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit Area
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDeleteArea();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Hapus Area
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sections list */}
      <div className="space-y-2">
        {sections.map((section) => (
          <div
            key={section._id}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/cameras?sectionId=${section._id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(`/cameras?sectionId=${section._id}`);
              }
            }}
            title={`Lihat kamera di ${section.name}`}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-elevated hover:border-primary/30 border border-transparent transition-colors group cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5 text-content-muted flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-content truncate">{section.name}</p>
              <p className="text-[10px] font-mono text-content-muted">{section.code}</p>
            </div>
            <span className="text-[10px] text-content-muted whitespace-nowrap">
              {section.cameraCount ?? 0} cameras
            </span>
            <span
              className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                section.isActive ? "bg-green-500" : "bg-surface-border"
              }`}
            />

            {(canEdit || canDelete) && (
              <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => {
                    setSectionMenuId((id) => (id === section._id ? null : section._id));
                    setMenuOpen(false);
                  }}
                  className="p-1 rounded text-content-muted hover:text-content hover:bg-surface-panel opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
                {sectionMenuId === section._id && (
                  <div className="absolute right-0 top-full mt-1 w-32 bg-surface-panel border border-surface-border rounded-lg shadow-lg overflow-hidden z-10">
                    {canEdit && (
                      <button
                        onClick={() => {
                          setSectionMenuId(null);
                          onEditSection(section);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-content hover:bg-surface-elevated transition-colors"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => {
                          setSectionMenuId(null);
                          onDeleteSection(section);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Hapus
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Add section */}
        {canAddSection && (
          <button
            onClick={onAddSection}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs text-content-muted border border-dashed border-surface-border rounded-lg hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add section
          </button>
        )}
      </div>
    </div>
  );
}
