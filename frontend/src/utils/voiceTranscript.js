const FILLER_WORDS = new Set(['uh', 'um', 'uhh', 'umm', 'er', 'erm', 'ah'])

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function normalizePunctuation(text) {
  return normalizeWhitespace(text)
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/([,.;!?]){2,}/g, '$1')
    .replace(/([,.;!?])\1+/g, '$1')
    .replace(/([,.;!?])([A-Za-z])/g, '$1 $2')
}

function collapseAdjacentDuplicateWords(text) {
  const words = normalizeWhitespace(text).split(' ')
  if (words.length === 0) return ''

  const result = []
  for (const word of words) {
    const previous = result[result.length - 1]
    const normalizedWord = word.toLowerCase()
    const normalizedPrevious = previous?.toLowerCase()
    if (normalizedPrevious === normalizedWord && normalizedWord.length > 2) {
      continue
    }
    result.push(word)
  }

  return result.join(' ')
}

function collapseAdjacentDuplicatePhrases(text) {
  const words = normalizeWhitespace(text).split(' ')
  if (words.length < 4) return normalizeWhitespace(text)

  for (let size = Math.min(4, Math.floor(words.length / 2)); size >= 2; size -= 1) {
    const collapsed = []
    let changed = false

    for (let index = 0; index < words.length;) {
      const phrase = words.slice(index, index + size)
      const nextPhrase = words.slice(index + size, index + size * 2)
      if (
        phrase.length === size &&
        nextPhrase.length === size &&
        phrase.join(' ').toLowerCase() === nextPhrase.join(' ').toLowerCase()
      ) {
        collapsed.push(...phrase)
        index += size * 2
        changed = true
        continue
      }
      collapsed.push(words[index])
      index += 1
    }

    if (changed) {
      return collapseAdjacentDuplicatePhrases(collapsed.join(' '))
    }
  }

  return words.join(' ')
}

function trimLeadingFillers(text) {
  const words = normalizeWhitespace(text).split(' ')
  let index = 0
  while (index < words.length && FILLER_WORDS.has(words[index].toLowerCase())) {
    index += 1
  }
  return words.slice(index).join(' ')
}

export function normalizeTranscriptForUi(text) {
  return normalizePunctuation(collapseAdjacentDuplicateWords(text))
}

export function normalizeTranscriptForRouting(text) {
  const trimmed = trimLeadingFillers(text)
  const withoutDuplicateWords = collapseAdjacentDuplicateWords(trimmed)
  const withoutDuplicatePhrases = collapseAdjacentDuplicatePhrases(withoutDuplicateWords)
  return normalizePunctuation(withoutDuplicatePhrases)
}
