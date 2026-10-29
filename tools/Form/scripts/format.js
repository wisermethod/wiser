// Portable form contract: no DOM, Node globals or package runtime.
import { BOARD_LIMITS as B, BOARD_KEYS, resolveBoards, checkLogo, displayOnly } from "./boards.js";
export const FORM_LIMITS = Object.freeze({
  idMax: 40, titleMin: 1, titleMax: 80, introMax: 300,
  fontsMin: 1, fontsMax: 6, familyMax: 40, fontSrcMax: 300,
  questionsMin: 1, questionsMax: 12, labelMin: 1, questionLabelMax: 200,
  shortMax: 40, helpMax: 300, optionsMin: 2, optionsMax: 12, imageOptionsMax: 8,
  optionValueMax: 40, optionLabelMax: 60, noteMax: 80, sampleMax: 24,
  paletteMin: 1, paletteMax: 8, hexShortDigits: 3, hexLongDigits: 6,
  motifColours: 2, typeFamiliesMin: 1, typeFamiliesMax: 2,
  sliderStepDefault: 1, sliderStepsMin: 1, sliderStepsMax: 100,
  endLabelMax: 24, placeholderMax: 120, answerMax: 1000, formBytesMax: 65536,
  slotsMin: 1, slotsMax: 20, slotNameMax: 30, slotAboutMin: 1, slotAboutMax: 120,
  slotMaxMin: 1, slotMaxMax: 300, inputFileBytesMax: 262144
});
export const FONT_HOSTS = Object.freeze(["https://fonts.gstatic.com", "https://cdn.jsdelivr.net"]);
export const SAMPLE_FORM = {
  title: "Your look",
  paged: false,
  intro: "Pick what feels like you. There are no wrong answers.",
  questions: [
    { id: "mood", short: "Colour mood", type: "image-radio", label: "Which colour mood feels most like your work?", options: [
      { value: "quiet", label: "Quiet", note: "a soft ground, one accent", picture: "palette:#F4F1EA,#2B2B2B,#C8553D" },
      { value: "white-and-one", label: "White and one", note: "white, one colour used big", picture: "palette:#FFFFFF,#1F1F1F,#2F6FED" },
      { value: "bright", label: "Bright", note: "two or three strong colours", picture: "palette:#FFD23F,#EE4266,#3BCEAC" },
      { value: "dark-first", label: "Dark first", note: "dark ground, light type", picture: "palette:#14161A,#E8E6E1,#7FD1AE" },
    ] },
    { id: "shapes", short: "Shapes", type: "image-checkbox", label: "Which shapes could belong in your brand? Pick any.", options: [
      { value: "dots", label: "Dots", picture: "motif:dots:#2B2B2B,#F4F1EA" },
      { value: "grid", label: "Grid", picture: "motif:grid:#2F6FED,#FFFFFF" },
      { value: "waves", label: "Waves", picture: "motif:waves:#C8553D,#F4F1EA" },
      { value: "arcs", label: "Arcs", picture: "motif:arcs:#14161A,#E8E6E1" },
      { value: "stripes", label: "Stripes", picture: "motif:stripes:#EE4266,#FFF7E6" },
      { value: "rings", label: "Rings", picture: "motif:rings:#3BCEAC,#14161A" },
    ] },
    { id: "era", short: "Classic or contemporary", type: "radio", label: "Classic or contemporary?", options: [
      { value: "classic", label: "Classic" }, { value: "contemporary", label: "Contemporary" },
      { value: "middle", label: "Middle" }, { value: "neither", label: "Neither" },
    ] },
    { id: "places", short: "Seen most on", type: "checkbox", label: "Where will people see your brand most?", options: [
      { value: "website", label: "Website" }, { value: "social", label: "Social posts" }, { value: "slides", label: "Slides" },
      { value: "print", label: "Print" }, { value: "email", label: "Email" },
    ] },
    { id: "loudness", short: "Quiet to bold (0 to 10)", type: "slider", label: "How quiet or bold should it be?", min: 0, max: 10, step: 1, value: 5, minLabel: "Quiet", maxLabel: "Bold" },
    { id: "never", short: "Must never feel like", type: "text", label: "Anything your brand must never feel like?", placeholder: "For example: corporate, cute, shouty" },
  ],
};

const L = FORM_LIMITS;
const ID = /^[a-z][a-z0-9-]{0,39}$/;
const VALUE = /^[a-z0-9][a-z0-9-]{0,39}$/;
// A family name starts with a letter and keeps one space between words, so CSS reads it as the same name everywhere.
const FAMILY = /^[A-Za-z][A-Za-z0-9]*(?: [A-Za-z0-9]+)*$/;
const SLOT = /^[a-z][a-z0-9-]{0,29}$/;
// Line and paragraph separators break a line as a newline does, so they are refused with the controls.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const HEX = /^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i;
const GENERICS = ["serif", "sans-serif", "monospace", "system-ui"];
// Names CSS reads as a keyword rather than a family, refused as declared families whatever their case.
const RESERVED = [...GENERICS, "cursive", "fantasy", "emoji", "math", "fangsong", "inherit", "initial", "unset", "revert", "default"];
const MOTIFS = ["dots", "grid", "waves", "arcs", "stripes", "rings", "triangles", "blob"];
const TYPES = ["radio", "checkbox", "image-radio", "image-checkbox", "slider", "text", "boards"];
const own = (o, k) => Object.hasOwn(o, k);
const record = o => o !== null && typeof o === "object" && !Array.isArray(o) &&
  (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
const pathKey = (p, k) => p ? `${p}.${k}` : k;
const length = s => [...s].length;
const tokens = s => [...s.matchAll(/\{\{([^{}]*)\}\}/g)];
const tokenField = p => /^(title|intro|questions\[\d+\]\.(label|short|help|placeholder|minLabel|maxLabel)|questions\[\d+\]\.options\[\d+\]\.(label|note|picture|sample)|fonts\[\d+\]\.(family|src))$/.test(p);
const nearInteger = n => Number.isFinite(n) && Math.abs(n - Math.round(n)) <= Number.EPSILON * Math.max(1, Math.abs(n)) * 8;

function validate(value, template = false) {
  const problems = [];
  const add = (path, message) => problems.push({ path, message });
  const deferred = new Set(), used = new Set(), seen = new Set();
  // Also checks unknown fields, keys and malformed containers. JSON cannot carry cycles or exotic values.
  function scan(v, p) {
    if (typeof v === "string") {
      if (CONTROL.test(v)) add(p, "Control characters are refused.");
      if (template && (v.includes("{{") || v.includes("}}"))) {
        const found = tokens(v);
        if (!tokenField(p)) add(p, "Tokens are not allowed here.");
        else {
          deferred.add(p);
          if (v.replace(/\{\{[^{}]*\}\}/g, "").includes("{{") || v.replace(/\{\{[^{}]*\}\}/g, "").includes("}}")) add(p, "Malformed token.");
          for (const [, name] of found) {
            if (!SLOT.test(name) || !record(value.slots) || !own(value.slots, name)) add(p, `Unknown slot: ${name}.`);
            else used.add(name);
          }
        }
      }
    } else if (v && typeof v === "object") {
      if (seen.has(v)) { add(p, "Repeated or circular object; use JSON data."); return; }
      seen.add(v);
      if (!Array.isArray(v) && !record(v)) { add(p, "Expected a JSON object."); return; }
      for (const k of Object.keys(v)) {
        const next = Array.isArray(v) ? `${p}[${k}]` : pathKey(p, k);
        if (CONTROL.test(k)) add(next, "Control character in key.");
        if (template && (k.includes("{{") || k.includes("}}"))) add(next, "Tokens are not allowed in keys.");
        scan(v[k], next);
      }
      seen.delete(v);
    } else if (v !== null && !["number", "boolean"].includes(typeof v)) add(p, "Expected JSON data.");
  }
  scan(value, "");
  function object(v, p, keys, required = []) {
    if (!record(v)) { add(p, "Expected an object."); return false; }
    for (const k of Object.keys(v)) if (!keys.includes(k)) add(pathKey(p, k), `Unknown key: ${k}.`);
    for (const k of required) if (!own(v, k)) add(pathKey(p, k), "Required key is missing.");
    return true;
  }
  function string(v, p, min, max, pattern) {
    if (typeof v !== "string") { add(p, "Expected a string."); return false; }
    if (deferred.has(p)) return false;
    if (length(v) < min || length(v) > max) add(p, `Expected ${min} to ${max} characters.`);
    if (pattern && !pattern.test(v)) add(p, "Invalid spelling.");
    return true;
  }
  function strings(v, p, spec) {
    for (const [k, min, max, pattern] of spec) if (own(v, k)) string(v[k], pathKey(p, k), min, max, pattern);
  }
  function array(v, p, min, max) {
    if (!Array.isArray(v)) { add(p, "Expected an array."); return false; }
    if (v.length < min || v.length > max) add(p, `Expected ${min} to ${max} entries.`);
    for (let i = 0; i < v.length; i++) if (!own(v,i)) add(`${p}[${i}]`, "Missing array entry.");
    return true;
  }
  function number(v, p) { if (typeof v !== "number" || !Number.isFinite(v)) { add(p, "Expected a finite number."); return false; } return true; }
  if (!object(value, "", ["id", "title", "intro", "paged", "fonts", "brand", "actions", "questions", ...(template ? ["slots"] : [])], ["title", "questions", ...(template ? ["slots"] : [])])) return { ok: false, problems };
  strings(value, "", [["id",1,L.idMax,ID],["title",1,L.titleMax],["intro",0,L.introMax]]);
  if (own(value, "paged")) {
    if (typeof value.paged !== "boolean") add("paged", "Expected a boolean.");
    if (Array.isArray(value.questions) && value.questions.length === 1) add("paged", "Paged is allowed only on forms with more than one question.");
  }
  const families = new Set(GENERICS), declared = new Set(); let pendingFamily = false;
  if (own(value, "fonts") && array(value.fonts,"fonts",L.fontsMin,L.fontsMax)) value.fonts.forEach((font,i) => {
    const p = `fonts[${i}]`;
    if (!object(font,p,["family","src"],["family","src"])) return;
    if (own(font,"family") && string(font.family,`${p}.family`,1,L.familyMax,FAMILY)) {
      const folded = font.family.toLowerCase();
      if (declared.has(folded) || RESERVED.includes(folded)) add(`${p}.family`,"Font family must be unique, ignoring case, and not a CSS keyword.");
      families.add(font.family); declared.add(folded);
    } else if (deferred.has(`${p}.family`)) pendingFamily = true;
    if (own(font,"src") && string(font.src,`${p}.src`,1,L.fontSrcMax)) {
      try {
        const u = new URL(font.src);
        if (u.protocol !== "https:" || !FONT_HOSTS.includes(u.origin) || u.search || u.hash || u.username || u.password || /[?#]/.test(font.src) || !/\.(woff2?|ttf|otf)$/.test(u.pathname)) throw Error();
      } catch { add(`${p}.src`,"Expected an HTTPS font URL on an allowed origin, without query, fragment or credentials, ending .woff2, .woff, .ttf or .otf."); }
    }
  });
  function picture(v,p) {
    if (!string(v,p,1,L.fontSrcMax)) return;
    const [kind,rawName,cols,...extra] = v.split(":");
    const name = rawName ?? "";
    let valid = !extra.length;
    if (kind === "palette") {
      const c = name.split(","); valid &&= cols === undefined && c.length >= L.paletteMin && c.length <= L.paletteMax && c.every(c => HEX.test(c));
    } else if (kind === "motif" || kind === "type") {
      if (cols !== undefined) { const c = cols.split(","); valid &&= c.length === L.motifColours && c.every(c => HEX.test(c)); }
      if (kind === "motif") valid &&= MOTIFS.includes(name);
      else { const f = name.split("+"); valid &&= f.length >= L.typeFamiliesMin && f.length <= L.typeFamiliesMax && f.every(f => families.has(f) || (pendingFamily && FAMILY.test(f))); }
    } else valid = false;
    if (!valid) add(p,"Invalid picture grammar or undeclared type family.");
  }
  if (own(value,"brand") && object(value.brand,"brand",["name","initials","sentence","body","words","logo"],["name","initials","sentence","body","words"])) {
    strings(value.brand,"brand",[["name",1,B.name],["initials",1,B.initials],["sentence",1,B.sentence],["body",1,B.body]]);
    if(array(value.brand.words,"brand.words",0,B.words)) value.brand.words.forEach((w,i)=>{
      const p=`brand.words[${i}]`;if(object(w,p,["word","not"],["word","not"])) strings(w,p,[["word",1,B.word],["not",1,B.word]]);
    });
    if(own(value.brand,"logo")) try { checkLogo(value.brand.logo); } catch(e) { add("brand.logo",e.message); }
  }
  if(own(value,"actions") && array(value.actions,"actions",2,3)) {
    const values=new Set();value.actions.forEach((a,i)=>{
      const p=`actions[${i}]`;if(!object(a,p,["value","label","note","needs"],["value","label","needs"]))return;
      strings(a,p,[["value",1,L.optionValueMax,VALUE],["label",1,60],["note",0,120]]);
      if(values.has(a.value)) add(`${p}.value`,"Action value must be unique.");values.add(a.value);
      if(!["one","some","any","none"].includes(a.needs))add(`${p}.needs`,"Expected one, some, any or none.");
    });
  }
  const ids = new Set();
  if (own(value,"questions") && array(value.questions,"questions",L.questionsMin,L.questionsMax)) value.questions.forEach((q,i) => {
    const p = `questions[${i}]`;
    if (!record(q)) { add(p,"Expected an object."); return; }
    const choice = ["radio","checkbox","image-radio","image-checkbox"].includes(q.type), image = ["image-radio","image-checkbox"].includes(q.type);
    const boards = q.type === "boards";
    const extra = boards ? ["options","pick"] : choice ? ["options"] : q.type === "slider" ? ["min","max","step","value","minLabel","maxLabel"] : q.type === "text" ? ["placeholder"] : [];
    object(q,p,["id","type","label","short","help",...extra],["id","type","label",...(boards ? ["options","pick"] : choice ? ["options"] : q.type === "slider" ? ["min","max"] : [])]);
    strings(q,p,[["id",1,L.idMax,ID],["label",1,L.questionLabelMax],["short",0,L.shortMax],["help",0,L.helpMax]]);
    if (typeof q.id === "string") { if (ids.has(q.id)) add(`${p}.id`,"Question id must be unique."); ids.add(q.id); }
    if (own(q,"type") && !TYPES.includes(q.type)) add(`${p}.type`,"Expected a supported question type.");
    if (choice && own(q,"options") && array(q.options,`${p}.options`,L.optionsMin,image ? L.imageOptionsMax : L.optionsMax)) {
      const values = new Set(); let pictured = 0;
      q.options.forEach((o,j) => {
        const op = `${p}.options[${j}]`;
        if (!object(o,op,["value","label","note",...(image ? ["picture","sample"] : [])],["value","label"])) return;
        strings(o,op,[["value",1,L.optionValueMax,VALUE],["label",1,L.optionLabelMax],["note",0,L.noteMax],...(image ? [["sample",0,L.sampleMax]] : [])]);
        if (typeof o.value === "string") { if (values.has(o.value)) add(`${op}.value`,"Option value must be unique."); values.add(o.value); }
        if (image && own(o,"picture")) { pictured++; picture(o.picture,`${op}.picture`); }
        if (image && own(o,"sample") && !deferred.has(`${op}.picture`) && !(typeof o.picture === "string" && o.picture.startsWith("type:"))) add(`${op}.sample`,"Sample is allowed only with a type picture.");
      });
      if (image && pictured < L.optionsMin) add(`${p}.options`,"At least two options must have a picture.");
    }
    if (boards) {
      if(![0,1,3].includes(q.pick)) add(`${p}.pick`,"Expected 0, 1 or 3.");
      if(!own(value,"brand")) add("brand","Boards require the shared brand.");
      if(array(q.options,`${p}.options`,1,12)) {
        const values=new Set();let recommended=0;
        q.options.forEach((o,j)=>{
          const op=`${p}.options[${j}]`;
          if(!object(o,op,["value","label","note","recommendation","board"],["value","label","board"]))return;
          strings(o,op,[["value",1,L.optionValueMax,VALUE],["label",1,B.label],["note",0,B.note],["recommendation",1,B.recommendation]]);
          if(values.has(o.value))add(`${op}.value`,"Option value must be unique.");values.add(o.value);
          if(own(o,"recommendation") && ++recommended>2)add(`${op}.recommendation`,"At most two recommendations.");
          if(!object(o.board,`${op}.board`,BOARD_KEYS,["pairing","palette","graphicSet","primaryMode"]))return;
          // Validate each option to locate independent failures; then validate the page too.
          try { resolveBoards(value.brand,[o]); } catch(e) { add(`${op}.board`,e.message); }
        });
        if(problems.length===0) try { resolveBoards(value.brand,q.options); } catch(e) { add(`${p}.options`,e.message); }
      }
    }
    if (q.type === "slider") {
      for (const k of ["min","max","step","value"]) if (own(q,k)) number(q[k],`${p}.${k}`);
      const step = own(q,"step") ? q.step : L.sliderStepDefault;
      if (Number.isFinite(step) && !(step > 0)) add(`${p}.step`,"Step must be positive.");
      if (Number.isFinite(q.min) && Number.isFinite(q.max)) {
        if (!(q.min < q.max) || !Number.isFinite(q.max-q.min)) add(`${p}.max`,"Maximum must be above minimum with a finite range.");
        if (Number.isFinite(step)) {
          const steps = (q.max-q.min)/step;
          if (!(step > 0) || !nearInteger(steps) || Math.round(steps) < L.sliderStepsMin || Math.round(steps) > L.sliderStepsMax) add(`${p}.step`,"Step must be positive and divide the range into 1 to 100 whole steps.");
          if (Number.isFinite(q.value) && (q.value < q.min || q.value > q.max || !nearInteger((q.value-q.min)/step))) add(`${p}.value`,"Value must be in range and on a step.");
          // Every step must land on a number of its own; far from zero a small step can vanish in rounding.
          if (step > 0 && nearInteger(steps)) for (let k = 1; k <= Math.min(Math.round(steps), L.sliderStepsMax); k++) {
            if (!(q.min + k * step > q.min + (k - 1) * step)) { add(`${p}.step`,"Each step must give a distinct value at this range's size."); break; }
          }
        }
      }
      strings(q,p,[["minLabel",0,L.endLabelMax],["maxLabel",0,L.endLabelMax]]);
    }
    if (q.type === "text") strings(q,p,[["placeholder",0,L.placeholderMax]]);
  });
  const boardQuestions=Array.isArray(value.questions)?value.questions.filter(q=>q?.type==="boards"):[];
  if(own(value,"brand") && !boardQuestions.length)add("brand","Brand is only used by boards.");
  if(boardQuestions.length>1)add("questions","Use one boards question per form.");
  if(own(value,"actions") && (!boardQuestions.length || !Array.isArray(value.actions)))add("actions","Actions need a boards question and an array.");
  if(boardQuestions.some(q=>q.pick===0) && !(value.questions.length===1 && !own(value,"actions")))add("questions","Pick 0 is a display-only form: one boards question and no actions.");
  if (template && own(value,"slots") && object(value.slots,"slots",record(value.slots) ? Object.keys(value.slots) : [])) {
    const entries = Object.entries(value.slots);
    if (entries.length < L.slotsMin || entries.length > L.slotsMax) add("slots", "Expected 1 to 20 slots.");
    for (const [name,slot] of entries) {
      const p = `slots.${name}`;
      if (!SLOT.test(name)) add(p,"Invalid slot name.");
      if (!used.has(name)) add(p,"Declared slot is unused.");
      if (!object(slot,p,["about","max"],["about","max"])) continue;
      if (own(slot,"about")) string(slot.about,`${p}.about`,L.slotAboutMin,L.slotAboutMax);
      if (own(slot,"max") && (!Number.isInteger(slot.max) || slot.max < L.slotMaxMin || slot.max > L.slotMaxMax)) add(`${p}.max`,"Expected a whole number from 1 to 300.");
    }
  }
  const form = template ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== "slots")) : value;
  try {
    if (new TextEncoder().encode(JSON.stringify(form)).length > L.formBytesMax) add("", "Form exceeds 65536 UTF-8 bytes.");
  } catch { add("", "Form is not serializable JSON data."); }
  return { ok: problems.length === 0, problems };
}
function safeCheck(value, template) {
  try { return validate(value, template); }
  catch { return { ok: false, problems: [{ path: "", message: "Expected finite, serializable JSON data." }] }; }
}
export function checkForm(value) { return safeCheck(value, false); }
export function checkTemplate(value) { return safeCheck(value, true); }
export function fillTemplate(template, values) {
  const checked = checkTemplate(template);
  if (!checked.ok) return checked;
  const problems = [];
  if (!record(values)) return { ok: false, problems: [{ path: "values", message: "Expected an object of slot values." }] };
  for (const k of Object.keys(values)) if (!own(template.slots,k)) problems.push({ path: `values.${k}`, message: "Unknown slot value." });
  for (const [k,slot] of Object.entries(template.slots)) {
    const v = values[k];
    if (!own(values,k) || typeof v !== "string" || length(v) > slot.max || CONTROL.test(v) || v.includes("{{") || v.includes("}}")) problems.push({ path: `values.${k}`, message: `Expected a string of at most ${slot.max} characters, without controls or token delimiters.` });
  }
  if (problems.length) return { ok: false, problems };
  function fill(v) {
    if (typeof v === "string") return v.replace(/\{\{([^{}]*)\}\}/g, (_,k) => values[k]);
    if (Array.isArray(v)) return v.map(fill);
    if (record(v)) return Object.fromEntries(Object.entries(v).map(([k,v]) => [k,fill(v)]));
    return v;
  }
  const form = fill(Object.fromEntries(Object.entries(template).filter(([k]) => k !== "slots")));
  const result = checkForm(form);
  return result.ok ? { ok: true, form } : result;
}

export function formJsonSchema() {
  // A deliberately broad schema: conditionals, uniqueness, byte size and arithmetic are
  // described here and enforced by checkForm. Only the requested JSON Schema vocabulary is used.
  const str = (max, description, min = 0, pattern) => ({ type: "string", minLength: min,
    // Zod's conversion counts UTF-16 units. The pattern keeps code-point limits and
    // the broad maxLength also admits astral characters in that consumer.
    maxLength: max * 2, pattern: pattern || `^(?:[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]|[^\\u0000-\\u001f\\u007f-\\u009f]){${min},${max}}$`, description });
  const obj = (properties, required, description) => ({ type: "object", properties, required, additionalProperties: false, description });
  const arr = (items,minItems,maxItems,description) => ({ type: "array",items,minItems,maxItems,description });
  const line = (max=L.formBytesMax) => str(max,"Plain single-line text.",1);
  const strength=obj({light:{type:"number",minimum:0,maximum:1},dark:{type:"number",minimum:0,maximum:1}},[],"Per-mode strength.");
  const roles=['ground','panel','text','headline','smallPrint','deep','pop','onPop','mark','cardFront','cardFrontText','cardFrontSmallPrint','cardBack','cardBackText','cardBackMark','sub','note','panelSmallPrint','hairline'];
  const colours=obj(Object.fromEntries(roles.map(k=>[k,line(7)])),[],"Opaque sRGB hex role overrides; validated by Contact Sheet.");
  const content=obj({smallPrint:line(),photoRules:line(),never:arr(line(),0,L.formBytesMax),markCaption:line(),closing:{type:["string","null"],description:"Optional closing text; null hides it."}},[],"Only board-specific text; shared member words are in brand.");
  const board=obj({
    pairing:obj({id:line(60),headingFrom:line(60),bodyFrom:line(60)},["id"],"Bundled pairing ids only, including donors; no font files."),
    palette:obj({id:line(60),overrides:obj({light:colours,dark:colours},[],"Mode overrides.")},["id"],"Bundled palette id."),
    graphicSet:obj({id:line(60),pattern:obj({angle:{type:"number",minimum:-180,maximum:180},strength},[],"Pattern settings."),texture:obj({strength},[],"Texture settings.")},["id"],"Bundled graphic-set id."),
    container:line(60),primaryMode:{type:"string",enum:["light","dark"]},handwriting:{type:["string","null"],description:"An offered public note family or null."},buttonRadius:{type:"number",minimum:0,maximum:100},heroPhrase:line(300),content,
    note:obj({text:line(),direction:{type:"string",enum:["left","right","up","down"]}},["text","direction"],"Margin note."),
    sample:obj(Object.fromEntries(['kicker','title','phrase','body','note','meta'].map(k=>[k,line()]).concat([["steps",arr(line(),1,L.formBytesMax)]])),['kicker','title','phrase','body','note','meta','steps'],"Supplied sample copy, as select.mjs names it."),
    items:obj(Object.fromEntries(['cardLine','cardBack','bannerHeadline','bannerLine','contact','primaryAction','secondaryAction','cardBackShort','tileBannerHeadline'].map(k=>[k,line()])),['cardLine','cardBack','bannerHeadline','bannerLine','contact','primaryAction','secondaryAction'],"Card and banner copy, as select.mjs names it."),
    closingExamples:arr(line(),2,3)
  },["pairing","palette","graphicSet","primaryMode"],"Board library references exactly as select.mjs names them. All ids must exist. Container required without brand.logo, refused with it. Contact Sheet checks both modes, SVG, type matching and font weight coverage. Supplied font files are not transmissible.");
  const option = obj({
    value: str(L.optionValueMax,"Unique option value: 1 to 40 lowercase letters, digits or hyphens, starting with a letter or digit.",1,VALUE.source),
    label: str(B.label,"Option label: boards up to 120 code points, other types up to 60.",1), note: str(B.note,"Optional note: boards up to 300 code points, others up to 80."),
    board, recommendation:str(B.recommendation,"Boards only; at most two recommended options, one line each.",1),
    picture: str(L.fontSrcMax,"Optional on image types; at least two options in an image question must have a picture. An option without one is a word choice drawn after the tiles. Other question types refuse it. palette:#hex,#hex,... has 1 to 8 colours, each #rgb or #rrggbb. motif:<name>[:#fg,#bg] uses dots, grid, waves, arcs, stripes, rings, triangles or blob and either no colours or exactly two. type:<family>[+<family>][:#fg,#bg] uses one or two declared font families or serif, sans-serif, monospace, system-ui, and either no colours or exactly two. Nothing is fetched for pictures.",1),
    sample: str(L.sampleMax,"Only with a type: picture, refused without a picture; at most 24 code points. Both type families draw this sample when supplied; otherwise the first draws Aa and the second Abc 123.")
  },["value","label"],"Options have unique values within their question.");
  const question = obj({
    id: str(L.idMax,"Unique question id: lowercase letter then up to 39 lowercase letters, digits or hyphens.",1,ID.source),
    type: { type:"string",enum:[...TYPES],description:"Supported question type; only that type's keys are accepted by checkForm." },
    label: str(L.questionLabelMax,"Question label, 1 to 200 code points.",1), short: str(L.shortMax,"Optional answer heading, at most 40 code points."),help:str(L.helpMax,"Optional help, at most 300 code points."),
    pick:{type:"integer",enum:[0,1,3],description:"Boards only, required: 3 up to three, 1 exactly one (a sole option is selected), 0 display-only with no actions or send."},
    options:arr(option,1,L.optionsMax,"Boards need 1 to 12 options. Required for choices: 2 to 12 options for radio/checkbox, 2 to 8 for image-radio/image-checkbox, with at least two options carrying a picture. Remaining image options may omit picture and draw as word choices after the tiles, in the same input group. Other types refuse options."),
    min:{type:"number",description:"Slider only, required finite minimum below max."},max:{type:"number",description:"Slider only, required finite maximum above min; range must be finite."},
    step:{type:"number",description:"Slider only: positive, default 1. (max-min)/step must be a whole number from 1 to 100."},
    value:{type:"number",description:"Slider only: in range and on a step; default step nearest the middle, ties upward."},
    minLabel:str(L.endLabelMax,"Slider only, at most 24 code points."),maxLabel:str(L.endLabelMax,"Slider only, at most 24 code points."),
    placeholder:str(L.placeholderMax,"Text only, at most 120 code points. Answers are trimmed and capped at 1000 code points.")
  },["id","type","label"],"Only common fields and the fields for the selected type are permitted. No string may contain control characters.");
  return obj({ id:str(L.idMax,"Optional form id: lowercase letter then up to 39 lowercase letters, digits or hyphens.",1,ID.source),
    title:str(L.titleMax,"Required title, 1 to 80 code points.",1),intro:str(L.introMax,"Optional introduction, at most 300 code points."),
    paged:{type:"boolean",description:"Optional, default false. Show one question at a time and send all answers together. Refused on a form with only one question, even when false; checkForm enforces this cross-field rule."},
    fonts:arr(obj({family:str(L.familyMax,"Font family name, 1 to 40 characters: ASCII letters and digits, starting with a letter, words separated by single spaces; unique ignoring case; never a CSS keyword: serif, sans-serif, monospace, system-ui, cursive, fantasy, emoji, math, fangsong, inherit, initial, unset, revert, default.",1,FAMILY.source),
      src:str(L.fontSrcMax,"HTTPS font URL, at most 300 code points, origin https://fonts.gstatic.com or https://cdn.jsdelivr.net, no query, fragment or credentials, path ending .woff2, .woff, .ttf or .otf.",1)},["family","src"],"Declared font; no generic family names."),L.fontsMin,L.fontsMax,"Optional 1 to 6 declared fonts."),
    brand:obj({name:line(B.name),initials:line(B.initials),sentence:line(B.sentence),body:line(B.body),words:arr(obj({word:line(B.word),not:line(B.word)},["word","not"]),0,B.words),logo:str(B.logoBytes,"Optional kept SVG text, at most 8192 UTF-8 bytes, checked by Contact Sheet's standalone static SVG rules.",1)},["name","initials","sentence","body","words"],"Shared once by every board. Required for boards, otherwise refused."),
    actions:arr(obj({value:str(L.optionValueMax,"Unique action value.",1,VALUE.source),label:line(60),note:str(120,"Optional action note."),needs:{type:"string",enum:["one","some","any","none"],description:"one exactly 1 pick; some at least 1; any any count; none zero picks. Unmet actions are disabled with their note shown."}},["value","label","needs"]),2,3,"Boards only. Replaces Send; chosen action is payload.action. Refused on a pick 0 display-only form."),
    questions:arr(question,L.questionsMin,L.questionsMax,"Required 1 to 12 questions; ids must be unique.")
  },["title","questions"],"Wiser form, JSON Schema draft 2020-12 vocabulary. At most 65536 UTF-8 bytes as JSON.stringify writes it. Lengths count code points; no control characters anywhere. Unknown keys, including submitLabel, are refused. checkForm enforces the conditional and cross-field rules described here.");
}
