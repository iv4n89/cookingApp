function jsonStringEnd(jsonText, start) {
  for (let index = start + 1; index < jsonText.length; index += 1) {
    if (jsonText[index] === '\\') {
      index += 1;
    } else if (jsonText[index] === '"') {
      return index;
    }
  }
  return -1;
}

export function findDuplicateJsonKeys(jsonText) {
  const objectScopes = [];
  const duplicates = [];

  for (let index = 0; index < jsonText.length; index += 1) {
    const character = jsonText[index];
    if (character === '{') {
      objectScopes.push(new Set());
      continue;
    }
    if (character === '[') {
      objectScopes.push(null);
      continue;
    }
    if (character === '}' || character === ']') {
      objectScopes.pop();
      continue;
    }
    if (character !== '"') continue;

    const end = jsonStringEnd(jsonText, index);
    if (end === -1) break;

    let next = end + 1;
    while (/\s/.test(jsonText[next] ?? '')) next += 1;
    const scope = objectScopes.at(-1);
    if (jsonText[next] === ':' && scope instanceof Set) {
      const key = JSON.parse(jsonText.slice(index, end + 1));
      if (scope.has(key)) duplicates.push(key);
      scope.add(key);
    }
    index = end;
  }
  return duplicates;
}
