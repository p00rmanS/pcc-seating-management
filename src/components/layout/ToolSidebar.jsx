export default function ToolSidebar({ tabs, activeTool, onToolChange, children }) {
  return (
    <aside className="workspace-sidebar">
      <div className="workspace-sidebar-tabs" role="tablist" aria-label="Workspace tools">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            role="tab"
            aria-selected={activeTool === id}
            className={activeTool === id ? "active" : ""}
            onClick={() => onToolChange(id)}
            title={label}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="workspace-sidebar-body" role="tabpanel">
        {children}
      </div>
    </aside>
  );
}
