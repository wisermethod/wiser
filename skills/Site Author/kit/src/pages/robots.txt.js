import kit from '../../kit.json';

export function GET() {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${kit.siteUrl}/sitemap-index.xml\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
