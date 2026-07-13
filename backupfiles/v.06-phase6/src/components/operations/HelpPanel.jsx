import { CircleHelp, Grid3X3, MousePointer2, Scissors, Users } from "lucide-react";

export default function HelpPanel() {
  return (
    <div className="workspace-tool-content help-panel">
      <div><h2 className="operation-heading"><CircleHelp size={15} /> Quick guide</h2><p>Use this guide while testing the seating and venue designer tools.</p></div>
      <section><h3><Grid3X3 size={15} /> Generate tables</h3><ol><li>Open Designer.</li><li>Select an area.</li><li>Choose a preset or custom number.</li><li>Set capacity, starting number, category, and size.</li><li>Review and confirm.</li></ol></section>
      <section><h3><MousePointer2 size={15} /> Edit areas</h3><ol><li>Open Areas and turn on Edit Mode.</li><li>Select an area, then drag, resize, or rotate it.</li><li>Use Designer → Canvas size when you need more room to the right or bottom.</li></ol></section>
      <section><h3><Scissors size={15} /> Split a table</h3><p>Select a table in the Inspector, choose Split, set the parts, and confirm. The new split tables appear immediately and the first part becomes selected.</p></section>
      <section><h3><Users size={15} /> Daily staffing</h3><p>Open Staffing, choose a date, then assign an employee to each venue area. Assignments are saved to Firebase for that venue and date.</p></section>
    </div>
  );
}
