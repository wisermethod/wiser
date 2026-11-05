import {readFileSync} from 'node:fs';
import {LIBRARY} from '../scripts/assemble.mjs';

export const gapFamily='business-blue';
export function balancedGapLibrary() {
 const library=JSON.parse(readFileSync(LIBRARY));
 // Only the middle palette fails Contact Sheet's contrast check. Both end
 // palettes remain unchanged, so emitting both would strand the far step.
 const middle=library.palettes.find(p=>p.id===`${gapFamily}-balanced`);
 middle.light.onPop=middle.light.pop;
 return library;
}
