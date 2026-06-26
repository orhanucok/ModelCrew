import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function ApiKeyInput({ value, onChange, placeholder = "API key" }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="api-key-input">
      <KeyRound size={16} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        autoComplete="off"
      />
      <button
        type="button"
        className="icon-button"
        onClick={() => setVisible((next) => !next)}
        aria-label={visible ? "Hide key" : "Show key"}
        title={visible ? "Hide key" : "Show key"}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
