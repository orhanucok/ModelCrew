type Props = {
  tone?: "user" | "system" | "final";
  title: string;
  body: string;
};

export function ChatMessage({ tone = "system", title, body }: Props) {
  return (
    <article className={`message-bubble ${tone}`}>
      <strong>{title}</strong>
      <p>{body}</p>
    </article>
  );
}
