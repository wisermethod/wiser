// Shared classic-script renderer, adapted from the working in-chat form test.
(() => {
const WORDS = Object.freeze({
  buttonSends: "Send my answers", buttonDrafts: "Add my answers to the chat", buttonAgain: "Send again",
  sent: "Sent to the chat.", drafted: "Your answers are in the message box. Press Send when you're ready.",
  notSent: "Not sent. Press the button again, or copy the answers below into the chat.",
  sentHere: "Sent. You can close this window.",
  alreadySent: "These answers were already sent.",
  closed: "This form has closed. Go back to the chat to answer there.",
  noFormTitle: "No form arrived", noFormBody: "This page didn't receive a form. Ask in the chat to show it again.",
  refusedTitle: "This form couldn't be shown", refusedBody: "Something in it was set up wrong. Ask in the chat to try again.",
  answersHeading: "Here are my answers:", none: "(none)", sliderValue: "Value:",
  next: "Next", back: "Back", progress: " · {n} of {m}",
  sampleDefault: "Aa", sampleSecond: "Abc 123",
  seeBoard:"See it full size", backToBoards:"Close this board", pickBoard:"Pick this one", boardModes:"Light or dark",
  pickThree:"Pick up to three.", pickCount:"Pick up to {n}.", recommended:"Recommended",
  look:"Look {n}", pickAtLeastOne:"Pick at least one.", pickAtLeastTwo:"Pick at least two.", pickAtLeastThree:"Pick at least three.",
  whatNext:"What next",
  boardNot:"not {word}", light:"Light", dark:"Dark", licence:"Licence"
});
const boardLib=globalThis.WiserBoards;
const state = { form: null, host: "unknown", sends: false, submitted: false };
function textColour(fg,bg) {
  const luminance = hex => {
    let s = hex.slice(1); if (s.length === 3) s = [...s].map(c => c+c).join("");
    const c = [0,2,4].map(i => parseInt(s.slice(i,i+2),16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
    return c[0]*.2126+c[1]*.7152+c[2]*.0722;
  };
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05) >= 4.5 ? fg : b > .179 ? "#000" : "#fff";
}
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
function colours(list, fallback) {
  const out = (list || "").split(",", 64).map((s) => s.trim()).filter((s) => HEX.test(s)).slice(0, 8);
  return out.length ? out : fallback;
}

// A picture is a short description, drawn here in code: "palette:#hex,#hex,..." or "motif:name[:#fg,#bg]".
function picture(desc, sample) {
  const box = svg("svg", { viewBox: "0 0 120 80", role: "img", "aria-hidden": "true", class: "pic" });
  const [kind, name, cols] = String(desc || "").split(":");
  if (kind === "palette") {
    const c = colours(name, ["#f5f5f4", "#807870", "#1c1917"]);
    const w = 120 / c.length;
    c.forEach((hex, i) => box.append(svg("rect", { x: i * w, y: 0, width: w + 0.5, height: 80, fill: hex })));
    return box;
  }
  const [fg, bg] = colours(cols, ["#2b2b2b", "#f4f1ea"]);
  box.append(svg("rect", { x: 0, y: 0, width: 120, height: 80, fill: bg }));
  if (kind === "type") {
    // A declared face loads in the background; the generic after it shows until it arrives, or if it never does.
    const family = f => ["serif", "sans-serif", "monospace", "system-ui"].includes(f) ? f : `"${f}", sans-serif`;
    const faces = name.split("+");
    const text = svg("text", { x: 60, y: faces.length > 1 ? 38 : 53, "text-anchor": "middle", "font-size": 36,
      "font-family": family(faces[0]), fill: textColour(fg, bg), "data-family": faces[0], "data-size": 36 });
    text.textContent = sample ?? WORDS.sampleDefault;
    box.append(text);
    if (faces[1]) {
      const second = svg("text", { x: 60, y: 65, "text-anchor": "middle", "font-size": 18,
        "font-family": family(faces[1]), fill: textColour(fg, bg), "data-family": faces[1], "data-size": 18 });
      second.textContent = sample ?? WORDS.sampleSecond;
      box.append(second);
    }
    return box;
  }
  const stroke = { fill: "none", stroke: fg, "stroke-width": 3, "stroke-linecap": "round" };
  if (name === "dots") {
    for (let x = 12; x < 120; x += 20) for (let y = 12; y < 80; y += 20) box.append(svg("circle", { cx: x, cy: y, r: 4, fill: fg }));
  } else if (name === "grid") {
    for (let x = 0; x <= 120; x += 16) box.append(svg("line", { x1: x, y1: 0, x2: x, y2: 80, ...stroke, "stroke-width": 1.5 }));
    for (let y = 0; y <= 80; y += 16) box.append(svg("line", { x1: 0, y1: y, x2: 120, y2: y, ...stroke, "stroke-width": 1.5 }));
  } else if (name === "waves") {
    for (let y = 16; y < 80; y += 18) box.append(svg("path", { d: `M0 ${y} Q15 ${y - 10} 30 ${y} T60 ${y} T90 ${y} T120 ${y}`, ...stroke }));
  } else if (name === "arcs") {
    for (let r = 14; r < 90; r += 14) box.append(svg("circle", { cx: 0, cy: 80, r, ...stroke }));
  } else if (name === "stripes") {
    for (let x = -80; x < 120; x += 16) box.append(svg("line", { x1: x, y1: 80, x2: x + 80, y2: 0, ...stroke }));
  } else if (name === "rings") {
    for (const [cx, cy] of [[30, 28], [72, 50], [100, 22]]) for (const r of [6, 12]) box.append(svg("circle", { cx, cy, r, ...stroke, "stroke-width": 2 }));
  } else if (name === "triangles") {
    for (let x = 0; x < 120; x += 24) box.append(svg("path", { d: `M${x} 70 L${x + 12} 46 L${x + 24} 70 Z`, fill: fg }));
  } else {
    box.append(svg("path", { d: "M20 60 C 20 20, 60 10, 80 30 S 110 70, 70 70 S 20 80, 20 60 Z", fill: fg }));
  }
  return box;
}

// Measuring SVG that is not drawn, such as a paged form's hidden question, can throw in some browsers,
// so only drawn samples are fitted; a page fits its own when it is shown.
const drawn = node => node.getClientRects().length > 0;
// A sample wider than its card is set smaller until it fits, again whenever a face arrives.
function fitSamples() {
  for (const text of document.querySelectorAll("svg text[data-size]")) {
    if (!drawn(text)) continue;
    const size = Number(text.dataset.size);
    let fitted = size;
    text.setAttribute("font-size", fitted);
    for (let pass = 0, width = text.getComputedTextLength(); width > 108 && pass < 4; pass++, width = text.getComputedTextLength()) {
      fitted = fitted * 108 / width * 0.99;
      text.setAttribute("font-size", fitted);
    }
  }
  // Fit paired faces at one scale, so the second stays half the first, with room between them.
  for (const box of document.querySelectorAll("svg.pic")) {
    const texts = [...box.querySelectorAll("text[data-size]")];
    if (texts.length !== 2 || !texts.every(drawn)) continue;
    let scale = Math.min(...texts.map(t => Number(t.getAttribute("font-size")) / Number(t.dataset.size)));
    texts.forEach((t,i) => {
      const bounds = t.getBBox(), size = Number(t.getAttribute("font-size"));
      if (bounds.height) scale = Math.min(scale, (i === 0 ? 38 : 24) / bounds.height * size / Number(t.dataset.size));
    });
    texts.forEach((t,i) => {
      t.setAttribute("font-size", Number(t.dataset.size) * scale);
      const bounds = t.getBBox();
      t.setAttribute("y", Number(t.getAttribute("y")) + (i === 0 ? 25 : 62) - bounds.y - bounds.height / 2);
    });
  }
}
document.fonts.addEventListener("loadingdone", fitSamples);

function choice(o, type, id, index) {
  const input = el("input", { type, name: id, value: o.value, id: `${id}-${index}` });
  return el("label", { class: "choice", for: input.id }, input,
    el("span", {}, el("span", { text: o.label }), o.note ? el("small", { text: o.note }) : null));
}

// Whether the card passes the height the host says it can hold, where it says one.
const overCap=()=>state.maxHeight>0&&Math.ceil(document.getElementById("root").getBoundingClientRect().bottom+window.scrollY)>state.maxHeight;
// One mode at a time, primary first, for a whole board the host's cap cannot hold in both.
function modeSwitch(art) {
  const show=mode=>{for(const part of art.children)part.hidden=part.dataset.mode!==mode;buttons.forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===mode)));};
  const buttons=["light","dark"].map(mode=>{const b=el("button",{type:"button",class:"board-mode-switch","data-mode":mode,"aria-pressed":"false",text:WORDS[mode]});b.addEventListener("click",()=>show(mode));return b;});
  show(art.firstElementChild?.dataset.mode||"light");
  return el("div",{class:"board-mode-switches",role:"group","aria-label":WORDS.boardModes},...buttons);
}

function boardQuestion(fieldset,q,id) {
  const look=q.view==="look",single=!look&&q.pick===1&&q.options.length===1;
  const model=boardLib.resolveBoards(state.form.brand,q.options);
  globalThis.WiserBoardView.loadFonts(model,boardLib.FONT_HOSTS);
  const limit=el("p",{class:"board-limit",role:"status",hidden:true});
  const grid=el("div",{class:`boards-tiles${look?' looks-tiles':''}`});
  const picks=new Map();
  function sync(){
    const count=[...picks.values()].filter(n=>n.checked).length;
    fieldset.dataset.picks=count;
    fieldset.dispatchEvent(new Event("boardpicks",{bubbles:true}));
    return count;
  }
  function pick(input,wanted){
    if(input.disabled||fieldset.disabled)return;
    input.checked=false;
    if(wanted && [...picks.values()].filter(n=>n.checked).length>=q.pick){
      limit.textContent=q.pick===3?WORDS.pickThree:WORDS.pickCount.replace("{n}",q.pick);limit.hidden=false;
    }else{input.checked=wanted;limit.hidden=true;}
    sync();
  }
  let returnFocus,viewerInput,activeInput;
  // A board replaces its row and the rows below; earlier rows keep their place.
  const viewer=el("section",{class:"board-viewer",hidden:true});
  const back=el("button",{type:"button",text:WORDS.backToBoards});
  const backBottom=el("button",{type:"button",text:WORDS.backToBoards});
  const viewerBar=el("div",{class:"board-viewer-bar"},back);
  const scroll=el("div",{class:"board-viewer-scroll"});
  const close=(restore=true)=>{
    if(viewer.hidden)return;
    grid.classList.remove("board-focus");
    for(const tile of grid.querySelectorAll(":scope>.board-option"))tile.hidden=false;
    viewer.hidden=true;viewer.remove();returnFocus?.setAttribute("aria-expanded","false");
    scroll.replaceChildren();grid.after(limit);limit.hidden=true;activeInput=undefined;
    if(restore){returnFocus?.focus({preventScroll:true});returnFocus?.closest(".board-option")?.scrollIntoView({block:"nearest"});}
  };
  back.addEventListener("click",()=>close());backBottom.addEventListener("click",()=>close());
  viewer.append(viewerBar,scroll,el("div",{class:"board-viewer-bar board-viewer-end"},backBottom));
  for(const [i,o]of q.options.entries()){
    const b=model.boards[i],label=o.label??WORDS.look.replace("{n}",i+1);
    if(!look&&(q.pick===0||single)){
      if(single){const input=el("input",{type:"checkbox",name:id,value:o.value,hidden:true});input.checked=true;fieldset.append(input);picks.set(o.value,input);}
      fieldset.append(el("h2",{class:"locked-name",text:o.label}),globalThis.WiserBoardView.draw(model,b,{logo:state.form.brand.logo}));
      continue;
    }
    if(look&&q.pick===0){grid.append(el("div",{class:"tile looks-tile"},globalThis.WiserBoardView.look(model,b,{logo:state.form.brand.logo}),el("span",{class:"tile-label",text:label})));continue;}
    const input=el("input",{type:"checkbox",class:"tile-input",id:`${id}-${i}`,name:id,value:o.value,"aria-describedby":o.note?`${id}-${i}-note`:undefined});
    if(q.pick===1&&q.options.length===1)input.checked=true;
    picks.set(o.value,input);
    input.addEventListener("change",()=>{pick(input,input.checked);if(activeInput===input)viewerInput.checked=input.checked;});
    input.addEventListener("keydown",event=>{if(event.key==='Enter'){event.preventDefault();if(!event.repeat){pick(input,!input.checked);if(activeInput===input)viewerInput.checked=input.checked;}}});
    const caption=el("span",{class:"tile-label"},el("span",{text:label}),el("span",{class:"mark check","aria-hidden":true}),o.note?el("small",{id:`${id}-${i}-note`,text:o.note}):null,
      !look&&o.recommendation?el("small",{class:"board-recommendation"},el("b",{text:WORDS.recommended}),document.createTextNode(" · "+o.recommendation)):null);
    const preview=look?globalThis.WiserBoardView.look(model,b,{logo:state.form.brand.logo}):el("div",{class:"board-crop","aria-hidden":true},globalThis.WiserBoardView.draw(model,b,{compact:true,logo:state.form.brand.logo}));
    const tile=el("label",{class:`tile boards-tile${look?' looks-tile':''}`,for:input.id},input,preview,caption);
    if(look){grid.append(tile);continue;}
    const full=el("button",{class:"see-board",type:"button",text:WORDS.seeBoard,"aria-expanded":"false"});
    full.addEventListener("click",()=>{
      if(!viewer.hidden&&returnFocus===full){close();return;}
      close(false);returnFocus=full;activeInput=input;
      // The mirror carries no name or value, so the answers never read it.
      viewerInput=el("input",{type:"checkbox",value:"","aria-label":WORDS.pickBoard});viewerInput.checked=input.checked;
      viewerInput.disabled=input.disabled||fieldset.disabled;
      viewerInput.addEventListener("change",()=>{pick(input,viewerInput.checked);viewerInput.checked=input.checked;});
      viewerBar.replaceChildren(back,el("label",{class:"choice"},viewerInput,el("span",{text:WORDS.pickBoard})),limit);
      limit.hidden=true;scroll.replaceChildren(el("h2",{class:"locked-name",text:o.label}),globalThis.WiserBoardView.draw(model,b,{logo:state.form.brand.logo}));
      // Measure before hiding: both columns of the clicked row step aside together.
      const option=full.closest(".board-option"),tiles=[...grid.children],top=option.offsetTop;
      const start=tiles.findIndex(n=>n.offsetTop===top);
      tiles[start].before(viewer);
      for(const tile of tiles.slice(start))tile.hidden=true;
      viewer.hidden=false;full.setAttribute("aria-expanded","true");
      // Where the host caps the card's height and the open board in place would pass it, the other boards step aside and one mode shows at a time.
      const focused=overCap();
      if(focused){grid.classList.add("board-focus");viewerBar.insertBefore(modeSwitch(scroll.querySelector(".board-art")),viewerBar.children[1]);}
      back.focus({preventScroll:true});
    });
    grid.append(el("div",{class:"board-option"},tile,full));
  }
  if(look||q.pick!==0&&!single)fieldset.append(grid,limit);
  if(q.min)fieldset.append(el("p",{class:"board-minimum help",role:"status",text:WORDS[['','pickAtLeastOne','pickAtLeastTwo','pickAtLeastThree'][q.min]]}));
  fieldset.dataset.picks=[...picks.values()].filter(n=>n.checked).length;
}

function questionBlock(q, index) {
  const id = `q-${index}`;
  const fieldset = el("fieldset", { class: `q q-${q.type}`, "data-id": q.id, "data-type": q.type });
  fieldset.append(el("legend", { id: `${id}-legend`, text: q.label }));
  if (q.help) fieldset.append(el("p", { class: "help", text: q.help }));
  const opts = Array.isArray(q.options) ? q.options : [];
  if(q.type === "boards") {
    if(q.pick===0||(q.view!=="look"&&q.pick===1&&q.options.length===1))fieldset.querySelector("legend").hidden=true;
    boardQuestion(fieldset,q,id);
  } else if (q.type === "radio" || q.type === "checkbox") {
    const list = el("div", { class: "choices" });
    opts.forEach((o, i) => list.append(choice(o, q.type, id, i)));
    fieldset.append(list);
  } else if (q.type === "image-radio" || q.type === "image-checkbox") {
    const multi = q.type === "image-checkbox";
    const grid = el("div", { class: "tiles", "data-count": opts.filter(o => o.picture).length });
    const words = el("div", { class: "choices" });
    opts.forEach((o, i) => {
      if (!o.picture) { words.append(choice(o, multi ? "checkbox" : "radio", id, i)); return; }
      const input = el("input", { type: multi ? "checkbox" : "radio", name: id, value: o.value, id: `${id}-${i}`, class: "tile-input" });
      const mark = el("span", { class: multi ? "mark check" : "mark dot", "aria-hidden": "true" });
      const caption = el("span", { class: "tile-label" }, el("span", { text: o.label }), mark, o.note ? el("small", { text: o.note }) : null);
      grid.append(el("label", { class: "tile", for: `${id}-${i}` }, input, picture(o.picture, o.sample), caption));
    });
    fieldset.append(grid);
    if (words.children.length) fieldset.append(words);
  } else if (q.type === "slider") {
    const min = Number.isFinite(q.min) ? q.min : 0;
    const max = Number.isFinite(q.max) ? q.max : 10;
    const step = q.step ?? 1;
    // The step nearest the middle, a tie going up, counted in whole steps so rounding cannot leave it off a step.
    const value = q.value ?? min + Math.round(Math.round((max - min) / step) / 2) * step;
    const out = el("output", { for: id, text: String(value) });
    const input = el("input", { type: "range", id, min, max, step, value, "aria-labelledby": `${id}-legend` });
    out.textContent = input.value;
    input.addEventListener("input", () => { out.textContent = input.value; });
    fieldset.append(
      el("div", { class: "slider" }, el("span", { class: "end", text: q.minLabel || String(min) }), input, el("span", { class: "end", text: q.maxLabel || String(max) })),
      el("p", { class: "help" }, document.createTextNode(`${WORDS.sliderValue} `), out),
    );
  } else {
    const input = el("textarea", { id, rows: 2, "aria-labelledby": `${id}-legend`, placeholder: q.placeholder || "" });
    input.addEventListener("input", (event) => {
      if (event.isComposing || [...input.value].length <= 1000) return;
      const caret = input.selectionStart;
      input.value = [...input.value].slice(0, 1000).join("");
      input.setSelectionRange(Math.min(caret, input.value.length), Math.min(caret, input.value.length));
    });
    fieldset.append(input);
  }
  return fieldset;
}

function readAnswers() {
  const answers = [];
  for (const [i, q] of state.form.questions.entries()) {
    const box = document.querySelectorAll("#form fieldset")[i];
    const opts = Array.isArray(q.options) ? q.options : [];
    const label = (v) => {const i=opts.findIndex(o=>o.value===v);return opts[i]?.label??(q.type==="boards"&&q.view==="look"?WORDS.look.replace("{n}",i+1):v);};
    let value;
    if (q.type === "slider") value = Number(box.querySelector("input[type=range]").value);
    else if (q.type === "text") value = [...box.querySelector("textarea").value].slice(0, 1000).join("").trim();
    else {
      const checked = new Set([...box.querySelectorAll("input:checked")].map(n => n.value));
      // Drawing puts words after pictures; answers keep the format's original option order.
      const picked = opts.filter(o => checked.has(o.value)).map(o => o.value);
      value = q.type === "radio" || q.type === "image-radio" ? (picked[0] ?? null) : picked;
    }
    const shown = Array.isArray(value) ? value.map(label).join(", ") || WORDS.none : value === null || value === "" ? WORDS.none : q.type === "slider" || q.type === "text" ? String(value) : label(value);
    answers.push({ id: q.id, question: q.short || q.label, type: q.type, value, shown, index: i });
  }
  return answers;
}

function setStatus(lines, kind = "") {
  const box = document.getElementById("status");
  box.className = `status ${kind}`;
  box.textContent = lines.join("\n");
}


function metadata({host,source,delivery} = {}) {
  const root = document.getElementById("root"), status = document.getElementById("status");
  for (const node of [root,status]) if (node) {
    if (host !== undefined) node.dataset.host = host;
    if (source !== undefined) node.dataset.source = source;
    if (delivery !== undefined) node.dataset.delivery = delivery;
  }
}
function setHost({host,sends,maxHeight}) {
  state.sends = sends; state.host = host; state.maxHeight = maxHeight > 0 ? maxHeight : undefined;
  metadata({host});
  const button = document.getElementById("submit");
  if (button && !state.submitted) button.textContent = sends ? WORDS.buttonSends : WORDS.buttonDrafts;
}
function setTheme(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
function showEmpty(refused = false) {
  const root = document.getElementById("root"); root.textContent = "";
  root.append(el("h1",{text: refused ? WORDS.refusedTitle : WORDS.noFormTitle}),
    el("p",{class:"intro",text: refused ? WORDS.refusedBody : WORDS.noFormBody}));
}
function render(form,{onSubmit,host = "unknown",source = "",sends = false} = {}) {
  state.form = form; state.host = host; state.sends = sends; state.submitted = false;state.sending=false;
  for (const font of form.fonts || []) {
    try {
      const face = new FontFace(font.family, `url(${JSON.stringify(new URL(font.src).href)})`);
      document.fonts.add(face);
      face.load().catch(() => { /* The sample keeps its generic face. */ });
    } catch { /* A face this browser refuses leaves its sample in the generic face. */ }
  }
  const root = document.getElementById("root"); root.textContent = "";
  const hasBoards=form.questions.some(q=>q.type==="boards"), onlyDisplay=boardLib.displayOnly(form);
  root.classList.toggle("board-card",hasBoards);
  if(hasBoards){
    if(!document.getElementById("boards-style")){const style=el("style",{id:"boards-style",text:boardLib.BOARD_CSS});document.head.append(style);}
  }
  const gridView=el("div",{id:"board-grid-view"});
  const destination=hasBoards?gridView:root;
  // Board rounds and paged forms both carry their title as a quiet progress line.
  const heading = el("h1",{text:form.title,...(form.paged||hasBoards ? {class:"progress"} : {}),...(form.paged?{"aria-live":"polite","aria-atomic":"true"}:{})});
  destination.append(heading);
  const intro = form.intro ? el("p",{class:"intro",text:form.intro}) : null;
  if (intro) destination.append(intro);
  const f = el("form",{id:"form"});
  const questions = form.questions.map(questionBlock);
  questions.forEach(q => f.append(q));
  const actionButtons=(form.actions||[]).map(a=>el("button",{type:"submit","data-action":a.value},el("span",{text:a.label}),el("small",{text:a.note||""})));
  const actionRow=el("div",{class:"board-actions","aria-label":WORDS.whatNext},...actionButtons);
  function pickedCount(){return readAnswers().filter(a=>a.type==="boards").reduce((n,a)=>n+a.value.length,0);}
  const boardQuestion=form.questions.find(q=>q.type==="boards");
  const canSend=()=>!boardQuestion||pickedCount()>=boardLib.minimumPicks(boardQuestion);
  function syncActions(){
    const count=pickedCount();
    actionButtons.forEach((button,i)=>{
      const a=form.actions[i];button.hidden=!boardLib.actionAllowed(a.needs,count,boardQuestion?.min);button.disabled=state.sending;
      const note=a.notes?.[count===0?"none":count===1?"one":"several"]??a.note??"";
      button.querySelector("small").textContent=note;button.querySelector("small").hidden=!note;
    });
    if(!form.actions)button.disabled=!canSend();
    const minimum=f.querySelector('.board-minimum');if(minimum)minimum.hidden=count>=boardQuestion.min;
  }
  const button = el("button",{id:"submit",type:"submit",text: state.sends ? WORDS.buttonSends : WORDS.buttonDrafts});
  let page = 0, advanceTimer;
  const back = el("button",{id:"back",type:"button",text:WORDS.back});
  const next = el("button",{id:"next",type:"button",text:WORDS.next});
  function move(index, {focus = true} = {}) {
    clearTimeout(advanceTimer);
    page = index;
    questions.forEach((q,i) => { q.hidden = i !== page; });
    heading.textContent = form.title + WORDS.progress.replace("{n}",page + 1).replace("{m}",questions.length);
    if (intro) intro.hidden = page !== 0;
    back.hidden = page === 0;
    next.hidden = page === questions.length - 1;
    button.hidden = !next.hidden||Boolean(form.actions)||onlyDisplay;
    actionRow.hidden=!next.hidden;
    fitSamples();
    if(hasBoards)globalThis.WiserBoardView.fitLooks();
    // Focus follows the member from one question to the next; on opening, nothing looks picked.
    if (focus) questions[page].querySelector("input,textarea,select,button")?.focus({preventScroll:true});
  }
  function advance(input,index) {
    clearTimeout(advanceTimer);
    if (index === questions.length - 1) return;
    advanceTimer = setTimeout(() => {
      if (page === index && input.isConnected && !input.disabled && !input.closest("fieldset").disabled) move(index + 1);
    },250);
  }
  if (form.paged) {
    f.append(el("div",{class:"page-actions"},back,next,button));
    back.addEventListener("click",() => move(page - 1));
    next.addEventListener("click",() => move(page + 1));
    questions.forEach((q,index) => {
      let arrow = false;
      q.addEventListener("keydown",event => {
        arrow = event.key.startsWith("Arrow");
        if (arrow) clearTimeout(advanceTimer);
      });
      q.addEventListener("keyup",() => { arrow = false; });
      q.addEventListener("pointerdown",() => { arrow = false; });
      for (const input of q.querySelectorAll('input[type="radio"]')) {
        // A click includes a pointer tap, label activation and Space's native click.
        // Native radio arrow changes also emit clicks, so handle those keys separately.
        input.addEventListener("keydown",event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (event.repeat) return;
            input.checked = true;
            advance(input,index);
          }
        });
        input.addEventListener("click",() => { if (!arrow) advance(input,index); });
      }
    });
  } else if(!form.actions&&!onlyDisplay)f.append(button);
  if(form.actions)f.append(actionRow);
  f.addEventListener("submit",async event => {
    event.preventDefault();
    if(onlyDisplay||state.sending)return;
    const action=form.actions?.find(a=>a.value===event.submitter?.dataset.action);
    if(form.actions?(!action||!boardLib.actionAllowed(action.needs,pickedCount(),boardQuestion?.min)):button.disabled||!canSend())return;
    state.sending=true;actionButtons.forEach(b=>b.disabled=true);
    // Implicit submission from an earlier question must never send a partial form.
    if (form.paged && page !== questions.length - 1) {state.sending=false;return;}
    clearTimeout(advanceTimer);
    button.disabled = true;
    if (form.paged) { back.disabled = true; next.disabled = true; }
    const answers = readAnswers();
    // One line per question: a line break typed into an answer becomes a space here, and stays in the data.
    const oneLine = text => String(text).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ");
    const summary = [WORDS.answersHeading,...answers.map(a => `- ${oneLine(a.question)}: ${oneLine(a.shown)}`),...(action?[`- ${WORDS.whatNext}: ${action.label}`]:[])].join("\n");
    const payload = { form: form.title, ...(form.id === undefined ? {} : {id:form.id}), answers:Object.fromEntries(answers.map(a => [a.id,a.value])),...(action?{action:action.value}:{}) };
    let sent = false, delivery = "failed", status, disabled = false;
    // A transport can supply its final status and lock the controls; chat keeps its retry behavior.
    try { const result = await onSubmit({payload,summary}); ({sent,delivery,status,disabled = false} = result); } catch { /* Keep a copy for retry. */ }
    setStatus([status ?? (!sent ? WORDS.notSent : state.sends ? WORDS.sent : WORDS.drafted)], sent ? "ok" : "bad");
    metadata({delivery});
    document.getElementById("copy").textContent = sent && !form.paged ? "" : summary;
    state.submitted = true; state.sending=false;button.disabled = false;syncActions();button.textContent = WORDS.buttonAgain;
    if (form.paged) { back.disabled = false; next.disabled = false; }
    if (disabled) for (const control of f.querySelectorAll("input,textarea,select,button,fieldset")) control.disabled = true;
  });
  destination.append(f,el("p",{id:"status",class:"status",role:"status","aria-live":"polite"}),el("pre",{id:"copy",class:"copy"}));
  if(hasBoards)root.prepend(gridView);
  f.addEventListener("boardpicks",syncActions);
  if(hasBoards)syncActions();
  if (form.paged) move(0,{focus:false});
  fitSamples();
  if(hasBoards)globalThis.WiserBoardView.fitLooks();
  if(hasBoards&&overCap())for(const art of root.querySelectorAll("fieldset>.board-art"))art.before(modeSwitch(art));
  metadata({host:state.host,source,delivery:"idle"});
}
globalThis.WiserForm = Object.freeze({WORDS,render,readAnswers,setStatus,setHost,setTheme,showEmpty,metadata});
})();
