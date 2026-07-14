import { MousePointer2 } from "lucide-react";

export default function InspectorPanel({ title, empty, emptyMessage, children }) {
  return (
    <aside className="workspace-inspector">
      <div className="workspace-inspector-heading">
        <span>{title}</span>
      </div>
      <div className="workspace-inspector-body">
        {empty ? (
          <div className="workspace-empty-inspector">
            <MousePointer2 size={24} />
            <p>{emptyMessage}</p>
          </div>
        ) : children}
      </div>
    </aside>
  );
}
