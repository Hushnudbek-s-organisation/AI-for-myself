import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Mark({ text }: { text: string }) {
  return (
    <div className="prose-aether text-[15px] text-mist-100">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
