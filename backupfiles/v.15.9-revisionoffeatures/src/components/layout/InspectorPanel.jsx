import { ChevronLeft, ChevronRight, MousePointer2 } from "lucide-react";

export default function InspectorPanel({ title, empty, emptyMessage, children, collapsed = false, onToggle }) {
  return (
    <aside className={`workspace-inspector ${collapsed ? "collapsed" : ""}`}>
      <div className="workspace-inspector-heading">
        {!collapsed && <span>{title}</span>}
        <button type="button" className="inspector-collapse-button" onClick={onToggle} title={collapsed ? "Open inspector" : "Minimize inspector"}>
          {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>
      {!collapsed && <div className="workspace-inspector-body">
        {empty ? (
          <div className="workspace-empty-inspector">
            <MousePointer2 size={24} />
            <p>{emptyMessage}</p>
          </div>
        ) : children}
      </div>}
    </aside>
  );
}
