import { ChatApp } from "@/components/workspace/ChatApp";

export default async function ChatIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatApp initialId={id} />;
}
