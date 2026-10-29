// Classic-script transport for the member's computer. The shared engine owns the drawing and words.
(() => {
  const view = globalThis.WiserForm;
  let form, closes;
  try {
    form = JSON.parse(document.getElementById("wiser-form").textContent);
    closes = JSON.parse(document.getElementById("wiser-form-closes").textContent);
    if (!Number.isFinite(closes)) throw Error();
  } catch { view.showEmpty(true); return; }
  let sent = false;
  const expired = () => Date.now() >= closes;
  const closed = () => ({sent:false,delivery:"closed",status:view.WORDS.closed,disabled:true});
  async function deliver({payload}) {
    if (expired()) return closed();
    const shown = view.readAnswers().map(({id,question,shown}) => ({id,question,shown}));
    try {
      const response = await fetch(new URL("answers", location.href), {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...payload,shown})
      });
      if (response.status === 200 || response.status === 409) {
        sent = true;
        clearTimeout(timer);
        return {sent:response.status === 200,delivery:String(response.status),
          status:response.status === 200 ? view.WORDS.sentHere : view.WORDS.alreadySent,disabled:true};
      }
    } catch { /* Keep the answers available for copying and retry. */ }
    return expired() ? closed() : {sent:false,delivery:"failed"};
  }
  view.render(form,{onSubmit:deliver,host:"this computer",source:"local",sends:true});
  if (globalThis.WiserBoards.displayOnly(form)) return;
  function close() {
    if (sent) return;
    view.setStatus([view.WORDS.closed]);
    for (const control of document.querySelectorAll("#form input,#form textarea,#form select,#form button,#form fieldset")) control.disabled = true;
  }
  const timer = setTimeout(close,Math.max(0,closes-Date.now()));
  // A window in the background may run its timers late, so any touch or keypress checks the time too.
  const check = () => { if (expired()) close(); };
  document.addEventListener("pointerdown",check,true);
  document.addEventListener("keydown",check,true);
  setInterval(check,15000);
  if (expired()) close();
})();
