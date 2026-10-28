const fragment = (value) => value && typeof value === 'object' && 'text' in value
  ? value : { text: '?', params: [value] };
export function sql(parts, ...values) {
  let text = parts[0];
  const params = [];
  values.forEach((value, i) => {
    const item = fragment(value);
    text += item.text + parts[i + 1];
    params.push(...item.params);
  });
  return { text, params };
}
export function eq(a, b) { return sql`${a} = ${b}`; }
export function and(...items) {
  return { text: items.map((item) => `(${item.text})`).join(' AND '), params: items.flatMap((item) => item.params) };
}
export function asc(value) { return value; }
export function inArray() { throw new Error('not used by these tests'); }
