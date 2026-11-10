export function network(kind = 'public') {
  const requests = [];
  return { requests, lookup: async () => [{ address: '93.184.216.34' }], fetch: async (value, options) => {
    if (options.redirect !== 'manual') throw new Error('automatic redirect');
    const url = new URL(value); requests.push(url.href);
    if (url.pathname === '/start') return new Response(null, { status: 302, headers: { location: kind === 'private-redirect' ? 'http://127.0.0.1/private' : '/page' } });
    if (url.pathname === '/style-start') return new Response(null, {status:302,headers:{location:'/styles/final.css'}});
    if (url.pathname === '/styles/final.css') return new Response('body{background:#fc0}', {headers:{'content-type':'text/css'}});
    if (url.pathname === '/page' && kind === 'large') {
      const head='<html><body style="margin:0;background:#345"><!--',tail='--></body></html>';
      return new Response(head+'a'.repeat(8388608-head.length-tail.length)+tail,{headers:{'content-type':'text/html'}});
    }
    if (url.pathname === '/page') return new Response((kind === 'redirected-style' ? '<link rel="stylesheet" href="/style-start">' : '') + '<html><body style="margin:0;background:#345"><div style="width:200px;height:80px;background:#fc0"></div>' + (kind === 'private-asset' ? '<img src="http://169.254.169.254/latest/meta-data">' : '') + '</body></html>', { headers: { 'content-type': 'text/html' } });
    throw new Error('unexpected synthetic URL');
  }};
}
