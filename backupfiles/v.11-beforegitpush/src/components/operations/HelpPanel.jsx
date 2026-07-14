import { CircleHelp, Grid3X3, ImagePlus, LayoutDashboard, MapPinned, MousePointer2, PlayCircle, Scissors, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";

const FAQ = [
  ["How do I add a table?", "Open Tables, choose a category, then press +1 through +10 or enter a custom capacity."],
  ["How do I put a surname or initials on a table?", "Select the table, enter the guest surname and optional guest initials, then enable the display switches you want."],
  ["How do I hide the table number?", "Select the table and turn off Show table number. Turn it back on whenever seaters need the numbered view."],
  ["How do I mark a table occupied?", "Select the table and press Occupied, or double-click the table on the floor."],
  ["How do I split a table?", "Select the original table, press Split this table, adjust the parts so their total equals the original capacity, then confirm."],
  ["How do I merge split tables?", "Select either split part, make every part Available, then press Merge back to original table."],
  ["How do I move or resize an area?", "Open Areas, press Edit Areas, select an area, then drag, resize, or rotate. Press Done Editing Areas when finished."],
  ["What is a landmark?", "A landmark is a map reference such as Stage, Restroom, Line 1, Fruit Station, or Drinks. It never receives guests or tables."],
  ["How do I recover from a mistake?", "Open Testing and use Undo, Redo, Restore last safe snapshot, or Export venue backup."],
  ["What does Live mean?", "The current venue is connected to Firebase. Saving to cloud means an update is being written. Offline means the local browser backup remains active."],
  ["What names should be used during testing?", "Use fake surnames and sample initials only. Do not enter real guest or private information until production approval."],
];

export default function HelpPanel() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => FAQ.filter(([q, a]) => `${q} ${a}`.toLowerCase().includes(query.toLowerCase())), [query]);
  return (
    <div className="workspace-tool-content help-panel">
      <div><h2 className="operation-heading"><CircleHelp size={15}/> Help & training</h2><p>A plain-language guide for leads, seaters, managers, and future team members.</p></div>
      <div className="tutorial-placeholder"><PlayCircle size={24}/><div><strong>Tutorial video coming soon</strong><span>Replace this section later with the approved training video link or embedded video.</span></div></div>
      <label className="help-search"><Search size={14}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search help, e.g. split table"/></label>
      <section><h3><MousePointer2 size={15}/> Daily seating basics</h3><ol><li>Select the correct venue.</li><li>Open Staffing and confirm assignments.</li><li>Select a table and enter a fake surname/initials during testing.</li><li>Set the actual party size.</li><li>Mark Occupied when seated and Available when cleared.</li></ol></section>
      <section><h3><MapPinned size={15}/> Areas and landmarks</h3><p>Seating areas hold tables. Landmarks are reference labels only. Use Edit Areas only when changing the map, then press Done Editing Areas.</p></section>
      <section><h3><Grid3X3 size={15}/> Table generator</h3><ol><li>Open Designer.</li><li>Select a seating area.</li><li>Choose the number, capacity, category, and starting number.</li><li>Review and confirm.</li><li>Move generated tables individually afterward.</li></ol></section>
      <section><h3><Scissors size={15}/> Split and merge</h3><p>The split capacities must add up exactly to the original capacity. Split parts appear as A, B, C, and so on. Clear occupied parts before merging.</p></section>
      <section><h3><Users size={15}/> Staffing</h3><p>Choose a date and assign employees to seating areas. Area assignments are separate from permanent employee profiles.</p></section>
      <section><h3><LayoutDashboard size={15}/> Dashboard and capacity</h3><p>The dashboard summarizes occupied tables, seated guests, staff assignments, VIP/large parties, and recent activity. Scanner totals remain manual until PCC authorizes an integration.</p></section>
      <section className="faq-section"><h3>Frequently asked questions</h3>{filtered.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}{filtered.length===0&&<p>No matching help topic found.</p>}</section>
      <section><h3><ImagePlus size={15}/> Blueprint reference</h3><p>You may import a venue image as a temporary tracing reference. It stays in the browser and is not uploaded to Firebase.</p></section>
    </div>
  );
}
