import { strFromU8, unzipSync } from "fflate";

type WordImage = { src: string; alt: string };
type WordContent = (string | WordImage)[];
type WordBlock =
  | { kind: "paragraph"; content: WordContent }
  | { kind: "table"; rows: WordContent[][] };
export type WordPreview = { blocks: WordBlock[]; partial: boolean };

const imageTypes = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
} as const;

function parseXml(bytes: Uint8Array) {
  const xml = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Непідтримуваний XML у документі.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Пошкоджений документ.");
  return doc;
}

export function readWordPreview(bytes: ArrayBuffer, makeUrl: (blob: Blob) => string): WordPreview {
  let totalSize = 0;
  let partial = false;
  const entries = unzipSync(new Uint8Array(bytes), {
    filter({ name, originalSize }) {
      const media = name.startsWith("word/media/");
      if (!media && name !== "word/document.xml" && name !== "word/_rels/document.xml.rels") return false;
      const limit = media ? 10 * 1024 * 1024 : 4 * 1024 * 1024;
      if (originalSize > limit || totalSize + originalSize > 24 * 1024 * 1024) {
        if (!media) throw new Error("Завеликий документ для перегляду.");
        partial = true;
        return false;
      }
      totalSize += originalSize;
      return true;
    },
  });
  const documentBytes = entries["word/document.xml"];
  if (!documentBytes) throw new Error("У файлі немає документа Word.");
  const documentXml = parseXml(documentBytes);
  const namespace = documentXml.documentElement.namespaceURI;
  const body = documentXml.getElementsByTagNameNS(namespace, "body")[0];
  if (!body) throw new Error("У файлі немає тексту документа.");

  const relationships = entries["word/_rels/document.xml.rels"];
  const media = new Map<string, string>();
  if (relationships) {
    const base = new URL("https://archive.invalid/word/document.xml");
    for (const rel of parseXml(relationships).getElementsByTagNameNS("*", "Relationship")) {
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target");
      if (!id || !target || rel.getAttribute("TargetMode") === "External" || !rel.getAttribute("Type")?.endsWith("/image")) continue;
      try {
        const path = new URL(target, base);
        if (path.origin === base.origin && path.pathname.startsWith("/word/media/")) {
          media.set(id, decodeURIComponent(path.pathname.slice(1)));
        }
      } catch {
        partial = true;
      }
    }
  }

  const imageUrls = new Map<string, string>();
  function imageFor(element: Element): WordImage | undefined {
    const relationship = Array.from(element.attributes).find(attribute =>
      attribute.namespaceURI?.endsWith("/relationships") && (attribute.localName === "embed" || attribute.localName === "id")
    );
    if (!relationship) return;
    const path = media.get(relationship.value);
    const extension = path?.split(".").pop()?.toLowerCase() as keyof typeof imageTypes | undefined;
    if (!path || !extension || !Object.hasOwn(imageTypes, extension) || !Object.hasOwn(entries, path)) {
      partial = true;
      return;
    }
    let src = imageUrls.get(path);
    if (!src) {
      src = makeUrl(new Blob([new Uint8Array(entries[path])], { type: imageTypes[extension] }));
      imageUrls.set(path, src);
    }
    return { src, alt: "Зображення з документа" };
  }

  function readParagraph(paragraph: Element): WordContent {
    const content: WordContent = [];
    let text = "";
    for (const element of paragraph.getElementsByTagName("*")) {
      if (element.namespaceURI === namespace) {
        if (element.localName === "t") text += element.textContent ?? "";
        else if (element.localName === "tab") text += "\t";
        else if (element.localName === "br" || element.localName === "cr") text += "\n";
      } else if (element.localName === "blip" || element.localName === "imagedata") {
        const image = imageFor(element);
        if (!image) continue;
        if (text) content.push(text);
        content.push(image);
        text = "";
      }
    }
    if (text) content.push(text);
    return content;
  }

  function children(element: Element, name: string) {
    return Array.from(element.children).filter(child => child.namespaceURI === namespace && child.localName === name);
  }

  const blocks: WordBlock[] = [];
  for (const block of body.children) {
    if (blocks.length >= 500) {
      partial = true;
      break;
    }
    if (block.namespaceURI !== namespace) continue;
    if (block.localName === "p") {
      blocks.push({ kind: "paragraph", content: readParagraph(block) });
    } else if (block.localName === "tbl") {
      const rows = children(block, "tr");
      if (rows.length > 100) partial = true;
      blocks.push({ kind: "table", rows: rows.slice(0, 100).map(row => {
        const cells = children(row, "tc");
        if (cells.length > 20) partial = true;
        return cells.slice(0, 20).map(cell => children(cell, "p").flatMap((p, index) =>
          index === 0 ? readParagraph(p) : ["\n", ...readParagraph(p)]
        ));
      }) });
    }
  }
  return { blocks, partial };
}
