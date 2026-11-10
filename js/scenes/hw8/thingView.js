/*
 * Draws the shared things (see things.js). One node per thing under `parent` (the world node),
 * so a thing shrinks and grows with the table like the house does.
 */
import { INCH } from '../hw6/miniatureModel.js';

const FORM = {box: 'cube', cylinder: 'tubeY', cone: 'coneY', pyramid: 'pyramidY', sphere: 'sphere'};

export function createThingViews(parent) {
   const views = new Map();                          // id -> {root, sections, shownAt, shownOff, made}
   const build = (id, entry) => {
      const root = parent.add(), sections = [];
      for (const p of entry.spec.parts) {
         const i = p.section || 0;
         while (sections.length <= i) sections.push(root.add());       // one node per section, so a section can be lifted off
         // Every form fills -1..1, so: move to the part's centre (its bottom + half its height), scale by half its size.
         const node = sections[i].add(FORM[p.shape]).move(p.at[0], p.at[1] + p.size[1] / 2, p.at[2])
                                 .scale(p.size[0] / 2, p.size[1] / 2, p.size[2] / 2);
         if (p.glow) node.color(p.color.map(c => .35 + 1.3 * c));       // brighter than any lit surface
         else node.color(p.color).dull();
      }
      return {root, sections, shownAt: [...entry.at], shownOff: sections.map((_, i) => [...(entry.off?.[i] || [0, 0, 0])]), made: entry.made};
   };
   return {
      // things: {id: {spec, at, off, made}} or null for a removed one. dt smooths moves that arrive in
      // network steps; what I hold myself (held = {id, section}) follows at once.
      draw(things, dt, held = null) {
         for (const [id, entry] of Object.entries(things || {})) {
            let view = views.get(id);
            if (view && (!entry || view.made !== entry.made)) { parent.remove(view.root); views.delete(id); view = null; }
            if (!entry?.spec?.parts || !Array.isArray(entry.at)) continue;
            if (!view) views.set(id, view = build(id, entry));
            const mine = held?.id === id, k = Math.min(1, 15 * dt);
            view.shownAt = view.shownAt.map((v, i) => v + (entry.at[i] - v) * (mine && held.section == null ? 1 : k));
            view.root.identity().move(view.shownAt).scale(INCH);          // 1 ft in the thing = 1 in on the table
            view.sections.forEach((node, n) => {
               const want = entry.off?.[n] || [0, 0, 0];
               view.shownOff[n] = view.shownOff[n].map((v, i) => v + (want[i] - v) * (mine && held.section === n ? 1 : k));
               node.identity().move(view.shownOff[n].map(v => v / INCH));  // the offset is in table metres; the root is in feet
            });
         }
         for (const [id, view] of views) if (!things?.[id]) { parent.remove(view.root); views.delete(id); }
      },
   };
}
