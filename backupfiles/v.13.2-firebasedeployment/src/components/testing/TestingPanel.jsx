import { CheckCircle2, Download, Redo2, RotateCcw, Undo2 } from "lucide-react";

const STEPS = [
  "Sign in and choose Hale ʻOhana",
  "Set the daily staffing date and assign servers",
  "Generate or add sample tables",
  "Seat sample parties using fake surnames only",
  "Split a table and confirm both parts appear",
  "Mark a table available again",
  "Review the Activity feed",
  "Review Capacity totals",
  "Refresh the browser and confirm the layout remains",
  "Open a second browser and verify live sync",
];

export default function TestingPanel({ canUndo, canRedo, onUndo, onRedo, onRestore, onExport }) {
  return (
    <div className="workspace-tool-content testing-panel">
      <div>
        <h2>Operational testing</h2>
        <p>Use fake guest information while this development build is being verified.</p>
      </div>
      <div className="testing-actions">
        <button type="button" onClick={onUndo} disabled={!canUndo}><Undo2 size={14}/> Undo</button>
        <button type="button" onClick={onRedo} disabled={!canRedo}><Redo2 size={14}/> Redo</button>
        <button type="button" onClick={onRestore}><RotateCcw size={14}/> Restore last safe snapshot</button>
        <button type="button" onClick={onExport}><Download size={14}/> Export venue backup</button>
      </div>
      <section className="testing-checklist">
        <h3>Hale ʻOhana workflow test</h3>
        {STEPS.map((step, index) => (
          <label key={step}><input type="checkbox"/><span><CheckCircle2 size={14}/>{index + 1}. {step}</span></label>
        ))}
      </section>
      <div className="testing-warning"><strong>Development data only.</strong> Do not enter real guest names, allergies, contact information, or other private information yet.</div>
    </div>
  );
}
