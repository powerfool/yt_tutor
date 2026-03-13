import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

type MdastNode = Record<string, unknown>;

// Tiptap JSON node types
type TiptapMark = { type: string; attrs?: Record<string, unknown> };
type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: TiptapMark[];
  content?: TiptapNode[];
  text?: string;
};

function inlineNodes(nodes: MdastNode[]): TiptapNode[] {
  const result: TiptapNode[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case "text":
        result.push({ type: "text", text: String(n.value) });
        break;
      case "strong":
        for (const child of inlineNodes(n.children as MdastNode[])) {
          result.push({ ...child, marks: [...(child.marks ?? []), { type: "bold" }] });
        }
        break;
      case "emphasis":
        for (const child of inlineNodes(n.children as MdastNode[])) {
          result.push({ ...child, marks: [...(child.marks ?? []), { type: "italic" }] });
        }
        break;
      case "inlineCode":
        result.push({ type: "text", text: String(n.value), marks: [{ type: "code" }] });
        break;
      case "break":
        result.push({ type: "hardBreak" });
        break;
      case "link":
        for (const child of inlineNodes(n.children as MdastNode[])) {
          result.push({
            ...child,
            marks: [
              ...(child.marks ?? []),
              { type: "link", attrs: { href: String(n.url), target: "_blank" } },
            ],
          });
        }
        break;
      default:
        if (n.children) result.push(...inlineNodes(n.children as MdastNode[]));
        break;
    }
  }
  return result;
}

function blockNode(n: MdastNode): TiptapNode | null {
  switch (n.type) {
    case "paragraph":
      return {
        type: "paragraph",
        content: inlineNodes(n.children as MdastNode[]),
      };
    case "heading":
      return {
        type: "heading",
        attrs: { level: n.depth as number },
        content: inlineNodes(n.children as MdastNode[]),
      };
    case "code":
      return {
        type: "codeBlock",
        attrs: { language: n.lang ?? null },
        content: [{ type: "text", text: String(n.value) }],
      };
    case "blockquote":
      return {
        type: "blockquote",
        content: (n.children as MdastNode[]).map(blockNode).filter(Boolean) as TiptapNode[],
      };
    case "list": {
      const tag = n.ordered ? "orderedList" : "bulletList";
      const items = (n.children as MdastNode[]).map((item): TiptapNode => {
        // listItem children are paragraphs — inline them directly as paragraph nodes
        const paragraphs = (item.children as MdastNode[]).map((child): TiptapNode => {
          if (child.type === "paragraph") {
            return { type: "paragraph", content: inlineNodes(child.children as MdastNode[]) };
          }
          return blockNode(child) ?? { type: "paragraph" };
        });
        return { type: "listItem", content: paragraphs };
      });
      return { type: tag, content: items };
    }
    case "thematicBreak":
      return { type: "horizontalRule" };
    default:
      return null;
  }
}

export function markdownToTiptapContent(markdown: string): TiptapNode[] {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(markdown) as unknown as { children: MdastNode[] };
  return tree.children.map(blockNode).filter(Boolean) as TiptapNode[];
}
