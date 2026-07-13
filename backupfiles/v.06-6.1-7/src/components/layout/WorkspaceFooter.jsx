import { Maximize2, Minus, Plus } from "lucide-react";

export default function WorkspaceFooter({
  legend,
  zoom,
  onZoomOut,
  onZoomIn,
  onResetZoom,
  onFit,
  areaEditMode,
}) {
  return (
    <footer className="workspace-footer">
      <div className="workspace-footer-legend">{legend}</div>
      <div className="workspace-footer-controls">
        {areaEditMode && <span className="workspace-edit-mode-pill">Area Edit Mode</span>}
        <button type="button" onClick={onZoomOut} title="Zoom out"><Minus size={14} /></button>
        <span className="workspace-zoom-value">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={onZoomIn} title="Zoom in"><Plus size={14} /></button>
        <button type="button" onClick={onResetZoom}>100%</button>
        <button type="button" onClick={onFit}><Maximize2 size={13} /> Fit</button>
      </div>
    </footer>
  );
}
