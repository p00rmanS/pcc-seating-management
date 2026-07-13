import { CircleHelp, Grid3X3, ImagePlus, LayoutDashboard, MapPinned, MousePointer2, Scissors, Users } from "lucide-react";

export default function HelpPanel() {
  return (
    <div className="workspace-tool-content help-panel">
      <div><h2 className="operation-heading"><CircleHelp size={15} /> Quick guide</h2><p>Use this guide while testing the venue designer and live operations tools.</p></div>
      <section><h3><MousePointer2 size={15} /> Draw seating areas</h3><ol><li>Open Areas and turn on Edit Mode.</li><li>Add Rectangle, Rounded, Pill, or Diamond.</li><li>Keep Area purpose set to Seating area.</li><li>Drag, resize, rotate, rename, or duplicate it.</li><li>Drag toward the right or bottom edge—the workspace expands automatically.</li></ol></section>
      <section><h3><MapPinned size={15} /> Add map landmarks</h3><p>Use Stage, Restroom, Drinks, Buffet, Entrance, Exit, or Station for reference-only map labels. They never receive tables or count toward seating capacity.</p></section>
      <section><h3><ImagePlus size={15} /> Optional blueprint</h3><p>Open Designer and import a PNG/JPG map. Lower the opacity, trace only the useful areas and landmarks, then hide or remove the image.</p></section>
      <section><h3><Grid3X3 size={15} /> Generate tables</h3><ol><li>Open Designer.</li><li>Select a seating area—not a landmark.</li><li>Choose a preset or custom number.</li><li>Set capacity, starting number, category, and size.</li><li>Review and confirm.</li></ol></section>
      <section><h3><Scissors size={15} /> Split a table</h3><p>Select a table in the Inspector, choose Split, set the parts, and confirm. The split tables appear immediately and the first part becomes selected.</p></section>
      <section><h3><Users size={15} /> Daily staffing</h3><p>Open Staffing, choose a date, then assign an employee to each seating area. Assignments save to Firebase for that venue and date.</p></section>
      <section><h3><LayoutDashboard size={15} /> Live operations</h3><p>Open Dashboard for real-time seated guests, available and occupied tables, venue capacity, VIPs, large parties, staffing, and recent activity.</p></section>
      <section><h3>Pan and zoom</h3><p>Use Shift + drag or the middle mouse button to pan. Use Ctrl/Cmd + mouse wheel or the footer controls to zoom.</p></section>
    </div>
  );
}
