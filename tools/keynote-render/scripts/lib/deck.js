/**
 * Joining content to presentation. A validated deck spec carries content only;
 * a brand carries the theme, the layout intents, the text keys, and the logo.
 * Resolving the two produces the slides the Keynote layer builds: master names,
 * text-item indices, and absolute image paths.
 *
 * Node built-ins only, so an unbranded build needs no installed package.
 */

import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

/**
 * Resolve validated slides against a brand, either of which may be absent.
 *
 * - theme: the --theme override wins over the brand's; one of them must name one
 * - layout: an intent the brand maps becomes that master's name; anything else
 *   passes through as a master name already
 * - texts: a semantic key becomes the index the brand maps it to on the resolved
 *   master; a numeric key passes through
 * - images: relative paths resolve against the deck spec's own directory
 * - logo: expands into one more image on each slide the brand names
 */
export function resolveDeck(slides, brandEntry, themeOverride, specDir) {
  const brand = brandEntry?.brand ?? null;
  const theme = themeOverride || brand?.theme;
  if (!theme) {
    throw new Error('no theme. Pass --theme "<installed theme>", or a --brand file that names one. Run "themes" to list what is installed.');
  }

  const resolved = slides.map((slide, i) => {
    const layout = (slide.layout && brand?.layouts?.[slide.layout]) || slide.layout;

    let texts = slide.texts;
    if (texts) {
      const keys = brand?.texts?.[layout] ?? {};
      const byIndex = {};
      for (const [key, value] of Object.entries(texts)) {
        if (/^\d+$/.test(key)) {
          byIndex[key] = value;
        } else if (keys[key] !== undefined) {
          byIndex[String(keys[key])] = value;
        } else {
          throw new Error(
            `slide ${i + 1}: texts key "${key}" is not an index, and no brand maps it on layout "${layout}". ` +
            'Build one slide on that layout, run inspect to read its text item indices, then map the key under that layout in the brand file.'
          );
        }
      }
      texts = byIndex;
    }

    const images = (slide.images ?? []).map((image, j) =>
      normalizeImage(image, specDir, `slide ${i + 1}, image ${j + 1}`));

    return { ...slide, layout, texts, images };
  });

  if (brand?.logo) {
    const logo = normalizeImage(brand.logo, brandEntry.dir, 'the brand logo');
    const target = brand.logo.slides ?? 'all';
    resolved.forEach((slide, i) => {
      const wanted = target === 'all'
        || (target === 'first' && i === 0)
        || (Array.isArray(target) && target.includes(i + 1));
      if (wanted) slide.images.push(logo);
    });
  }

  return { theme, slides: resolved };
}

function normalizeImage(image, baseDir, label) {
  const path = isAbsolute(image.path) ? image.path : resolve(join(baseDir, image.path));
  if (!existsSync(path)) throw new Error(`${label}: no file at ${path}.`);
  return {
    path,
    x: image.x ?? null,
    y: image.y ?? null,
    width: image.width ?? null,
    height: image.height ?? null
  };
}
