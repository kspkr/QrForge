import { useEffect } from "react";

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · QRForge` : "QRForge — The open-source QR platform";
  }, [title]);
}
