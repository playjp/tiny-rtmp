export type XMLNode = string | {
  name: string;
  attributes: Record<string, string>;
  children: XMLNode[];
};
export const XMLNode = {
  from(name: string, attributes: Record<string, string> = {}, children: XMLNode[] = []) {
    return { name, attributes, children };
  },
};

export const serializeXML = (node: XMLNode, depth: number = 0): string => {
  if (typeof node === 'string') {
    return '  '.repeat(depth) + node + '\n';
  }

  const attributes = Array.from(Object.entries(node.attributes)).map(([k, v]) => `${k}="${v}"`).join(' ');
  let result = '  '.repeat(depth) + `<${node.name}${attributes === '' ? '' : ' ' + attributes}${node.children.length === 0 ? ' /' : ''}>\n`;
  if (node.children.length === 0) { return result; }

  for (const child of node.children) {
    result += serializeXML(child, depth + 1);
  }
  result += '  '.repeat(depth) + `</${node.name}>\n`;
  return result;
};
