/** Refuse report lists from their minimum JSON size before allocating them. */
export const ANSWER_CHARACTERS = 48000;
export function checkAnswerSize(characters) {
  if (characters >= ANSWER_CHARACTERS) {
    throw new Error('Error: answer reaches 48,000 serialized characters; refused whole.');
  }
}
export function checkAnswerListSize(count, minimumItemCharacters) {
  // Brackets plus one comma between items. Each item's real JSON can only be
  // larger, so this never refuses a list that could fit in the final answer.
  checkAnswerSize(count === 0 ? 2 : count * (minimumItemCharacters + 1) + 1);
}
