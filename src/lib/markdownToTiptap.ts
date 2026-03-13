import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

type MdastNode = Record<string, unknown>;

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlines(nodes: MdastNode[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text":
          return esc(String(n.value));
        case "strong":
          return `<strong>${inlines(n.children as MdastNode[])}</strong>`;
        case "emphasis":
          return `<em>${inlines(n.children as MdastNode[])}</em>`;
        case "inlineCode":
          return `<code>${esc(String(n.value))}</code>`;
        case "break":
          return "<br>";
        case "link":
          return `<a href="${esc(String(n.url))}">${inlines(n.children as MdastNode[])}</a>`;
        default:
          if (n.children) return inlines(n.children as MdastNode[]);
          return "";
      }
    })
    .join("");
}

function block(n: MdastNode): string {
  switch (n.type) {
    case "paragraph":
      return `<p>${inlines(n.children as MdastNode[])}</p>`;
    case "heading": {
      const l = n.depth as number;
      return `<h${l}>${inlines(n.children as MdastNode[])}</h${l}>`;
    }
    case "code":
      return `<pre><code>${esc(String(n.value))}</code></pre>`;
    case "blockquote":
      return `<blockquote>${(n.children as MdastNode[]).map(block).join("")}</blockquote>`;
    case "list": {
      const tag = n.ordered ? "ol" : "ul";
      const items = (n.children as MdastNode[])
        .map((item) => {
          const content = (item.children as MdastNode[]).map(block).join("");
          return `<li>${content}</li>`;
        })
        .join("");
      return `<${tag}>${items}</${tag}>`;
    }
    case "thematicBreak":
      return "<hr>";
    default:
      return "";
  }
}

export function markdownToHtml(markdown: string): string {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(markdown) as unknown as { children: MdastNode[] };
  return tree.children.map(block).join("");
}
