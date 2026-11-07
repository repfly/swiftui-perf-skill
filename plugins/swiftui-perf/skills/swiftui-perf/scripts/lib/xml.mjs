const ENTITIES = Object.freeze({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" });
const TOKEN = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>/g;
const ATTRIBUTE = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export const decodeEntities = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, name) => {
    if (name[0] !== "#") return ENTITIES[name] ?? match;
    return String.fromCodePoint(name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10));
  });

export class XmlElement {
  constructor(tag, attributes, parent = null) {
    this.tag = tag;
    this.attributes = attributes;
    this.parent = parent;
    this.children = [];
    this.text = "";
  }

  attr(name) {
    return this.attributes[name] ?? null;
  }

  child(tag) {
    return this.children.find((element) => element.tag === tag) ?? null;
  }

  childrenNamed(tag) {
    return this.children.filter((element) => element.tag === tag);
  }

  *descendants(tag = null) {
    for (const element of this.children) {
      if (!tag || element.tag === tag) yield element;
      yield* element.descendants(tag);
    }
  }

  find(pathText) {
    return pathText.split("/").reduce((node, tag) => node?.child(tag) ?? null, this);
  }
}

function parseAttributes(source) {
  const attributes = {};
  for (const [, name, double, single] of source.matchAll(ATTRIBUTE)) attributes[name] = decodeEntities(double ?? single);
  return attributes;
}

export function parseXml(source) {
  const root = new XmlElement("#document", {});
  let current = root;
  let last = 0;
  for (const match of source.matchAll(TOKEN)) {
    const between = source.slice(last, match.index);
    if (between.trim()) current.text += decodeEntities(between);
    last = match.index + match[0].length;
    const [, closing, tag, attributeText, selfClosing, cdata] = match;
    if (cdata !== undefined) current.text += cdata;
    if (!tag) continue;
    if (closing) {
      current = current.parent ?? root;
      continue;
    }
    const element = new XmlElement(tag, parseAttributes(attributeText ?? ""), current);
    current.children.push(element);
    if (!selfClosing) current = element;
  }
  return root.children[0] ?? root;
}
