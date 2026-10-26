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
  sampleDefault: "Aa", sampleSecond: "Abc 123"
});
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
    const text = svg("text", { x: 60, y: faces.length > 1 ? 45 : 53, "text-anchor": "middle", "font-size": 36,
      "font-family": family(faces[0]), fill: textColour(fg, bg), "data-family": faces[0], "data-size": 36 });
    text.textContent = sample ?? WORDS.sampleDefault;
    box.append(text);
    if (faces[1]) {
      const second = svg("text", { x: 60, y: 66, "text-anchor": "middle", "font-size": 12,
        "font-family": family(faces[1]), fill: textColour(fg, bg), "data-family": faces[1], "data-size": 12 });
      second.textContent = WORDS.sampleSecond;
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

// A sample wider than its card is set smaller until it fits, again whenever a face arrives.
function fitSamples() {
  for (const text of document.querySelectorAll("svg text[data-size]")) {
    const size = Number(text.dataset.size);
    let fitted = size;
    text.setAttribute("font-size", fitted);
    for (let pass = 0, width = text.getComputedTextLength(); width > 108 && pass < 4; pass++, width = text.getComputedTextLength()) {
      fitted = fitted * 108 / width * 0.99;
      text.setAttribute("font-size", fitted);
    }
  }
}
document.fonts.addEventListener("loadingdone", fitSamples);

function questionBlock(q, index) {
  const id = `q-${index}`;
  const fieldset = el("fieldset", { class: `q q-${q.type}`, "data-id": q.id, "data-type": q.type });
  fieldset.append(el("legend", { id: `${id}-legend`, text: q.label }));
  if (q.help) fieldset.append(el("p", { class: "help", text: q.help }));
  const opts = Array.isArray(q.options) ? q.options : [];
  if (q.type === "radio" || q.type === "checkbox") {
    const list = el("div", { class: "choices" });
    opts.forEach((o, i) => {
      const input = el("input", { type: q.type, name: id, value: o.value, id: `${id}-${i}` });
      list.append(el("label", { class: "choice", for: `${id}-${i}` }, input, el("span", {}, el("span", { text: o.label }), o.note ? el("small", { text: o.note }) : null)));
    });
    fieldset.append(list);
  } else if (q.type === "image-radio" || q.type === "image-checkbox") {
    const multi = q.type === "image-checkbox";
    const grid = el("div", { class: "tiles" });
    opts.forEach((o, i) => {
      const input = el("input", { type: multi ? "checkbox" : "radio", name: id, value: o.value, id: `${id}-${i}`, class: "tile-input" });
      const mark = el("span", { class: multi ? "mark check" : "mark dot", "aria-hidden": "true" });
      const caption = el("span", { class: "tile-label" }, el("span", { text: o.label }), o.note ? el("small", { text: o.note }) : null);
      grid.append(el("label", { class: "tile", for: `${id}-${i}` }, input, picture(o.picture, o.sample), mark, caption));
    });
    fieldset.append(grid);
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
    const label = (v) => (opts.find((o) => o.value === v) || {}).label || v;
    let value;
    if (q.type === "slider") value = Number(box.querySelector("input[type=range]").value);
    else if (q.type === "text") value = [...box.querySelector("textarea").value].slice(0, 1000).join("").trim();
    else {
      const picked = [...box.querySelectorAll("input:checked")].map((n) => n.value);
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
function setHost({host,sends}) {
  state.sends = sends; state.host = host;
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
  state.form = form; state.host = host; state.sends = sends; state.submitted = false;
  for (const font of form.fonts || []) {
    try {
      const face = new FontFace(font.family, `url(${JSON.stringify(new URL(font.src).href)})`);
      document.fonts.add(face);
      face.load().catch(() => { /* The sample keeps its generic face. */ });
    } catch { /* A face this browser refuses leaves its sample in the generic face. */ }
  }
  const root = document.getElementById("root"); root.textContent = "";
  root.append(el("h1",{text:form.title}));
  if (form.intro) root.append(el("p",{class:"intro",text:form.intro}));
  const f = el("form",{id:"form"});
  form.questions.forEach((q,i) => f.append(questionBlock(q,i)));
  const button = el("button",{id:"submit",type:"submit",text: state.sends ? WORDS.buttonSends : WORDS.buttonDrafts});
  f.append(button);
  f.addEventListener("submit",async event => {
    event.preventDefault(); if (button.disabled) return;
    button.disabled = true;
    const answers = readAnswers();
    // One line per question: a line break typed into an answer becomes a space here, and stays in the data.
    const oneLine = text => String(text).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ");
    const summary = [WORDS.answersHeading,...answers.map(a => `- ${oneLine(a.question)}: ${oneLine(a.shown)}`)].join("\n");
    const payload = { form: form.title, ...(form.id === undefined ? {} : {id:form.id}), answers:Object.fromEntries(answers.map(a => [a.id,a.value])) };
    let sent = false, delivery = "failed", status, disabled = false;
    // A transport can supply its final status and lock the controls; chat keeps its retry behavior.
    try { const result = await onSubmit({payload,summary}); ({sent,delivery,status,disabled = false} = result); } catch { /* Keep a copy for retry. */ }
    setStatus([status ?? (!sent ? WORDS.notSent : state.sends ? WORDS.sent : WORDS.drafted)], sent ? "ok" : "bad");
    metadata({delivery});
    document.getElementById("copy").textContent = sent ? "" : summary;
    state.submitted = true; button.textContent = WORDS.buttonAgain; button.disabled = false;
    if (disabled) for (const control of f.querySelectorAll("input,textarea,select,button,fieldset")) control.disabled = true;
  });
  root.append(f,el("p",{id:"status",class:"status",role:"status","aria-live":"polite"}),el("pre",{id:"copy",class:"copy"}));
  fitSamples();
  metadata({host:state.host,source,delivery:"idle"});
}
globalThis.WiserForm = Object.freeze({WORDS,render,readAnswers,setStatus,setHost,setTheme,showEmpty,metadata});
})();
