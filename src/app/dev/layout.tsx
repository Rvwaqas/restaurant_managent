import { notFound } from "next/navigation";
import { env } from "@/config/env";

export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production" && !env.devTools) {
    notFound();
  }

  return <div className="dev-diagnostics-wrapper">{children}</div>;
}

