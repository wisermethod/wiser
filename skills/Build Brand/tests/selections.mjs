// Invented specimen content. Every design choice is explicit in the selection.
export const energies = ['quiet', 'white-and-one', 'bright', 'colour-ground', 'dark-first'];
export function board(library, { number = 1, palette = 'paper-orange', pairing = 'warm-grotesque', graphic = 'drawn', container = 'drafting-box', mode, handwriting = null } = {}) {
  const p = library.palettes.find((p) => p.id === palette);
  return {
    number, name: p.name, group: p.energy, energy: p.energy.replaceAll('-', ' '), why: p.description,
    primaryMode: mode || (p.energy === 'dark-first' ? 'dark' : 'light'), buttonRadius: 3,
    palette: { id: palette }, pairing: { id: pairing }, handwriting,
    graphicSet: { id: graphic }, container, initials: 'SP', heroPhrase: 'made to last.',
    content: { brandName: 'Sample Person', sentence: 'Small things, made to last.', body: 'Give a useful thing a little time. Work with its shape, test the edge, and keep the detail that helps.', smallPrint: 'A practice for everyday use.', photoRules: 'Show a real object in use. Let clear daylight reveal the edge, surface and scale.', never: ['Crowded scenes.', 'Disposable props.'] },
    note: { text: 'Keep this edge.', direction: 'left' },
    words: [{word:'Useful',not:'busy'}, {word:'Patient',not:'slow'}, {word:'Direct',not:'cold'}],
    sample: { kicker: 'One small practice', title: 'Make room for care', phrase: 'care', body: 'Start with an edge you touch each day. Try one small change. Keep what makes it easier to use.', note: 'Try it by hand.', steps: ['Look','Shape','Try','Keep'], meta: 'A practice to return to' },
    items: { cardLine: 'Thoughtful work for everyday use', cardBack: 'Make a little room.\nKeep the useful detail.', cardBackShort: 'Keep the useful detail.', bannerHeadline: 'Give good work room.', tileBannerHeadline: 'Room for good work.', bannerLine: 'Thoughtful choices in the things we use each day.', contact: 'sample.example', primaryAction: 'Explore the work', secondaryAction: 'Read the process' },
    closingExamples: ['Keep this colour and try a taller face.', 'Use the lines with a softer ground.', 'Make the next version quieter.']
  };
}
export function selection(boards, library) {
  return { person: 'Sample Person', intro: ['A brand board brings colour, type and marks together so you can judge a whole direction.', 'Tell us what to keep or change, for example the colours of one with the type of another.'], groups: energies.filter((energy) => boards.some((b) => b.group === energy)).map((id) => ({id, label:id.replaceAll('-', ' ')})), footnote: 'These monograms are placeholders. A real mark follows the chosen direction.', boards };
}
export function matchingPairing(library, palette) {
  const choices = { 1: 'soft-serif', 2: 'warm-grotesque', 3: 'lively' };
  return choices[palette.paletteLoudness];
}
