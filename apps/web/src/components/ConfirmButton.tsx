'use client';

import { useState } from 'react';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  confirmText: string;
}

// Server Action 用の form submit を、ネイティブ confirm() で握り潰せるボタン。
// 二重防止のため確認後に disabled に。
export function ConfirmButton({ confirmText, children, className, ...rest }: Props) {
  const [pending, setPending] = useState(false);
  return (
    <button
      {...rest}
      type="submit"
      formNoValidate
      disabled={pending || rest.disabled}
      className={className}
      onClick={(e) => {
        if (pending) return;
        if (!window.confirm(confirmText)) {
          e.preventDefault();
          return;
        }
        setPending(true);
      }}
    >
      {children}
    </button>
  );
}
