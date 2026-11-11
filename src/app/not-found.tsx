import Link from "next/link";
import { FileQuestion, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 select-none safe-top safe-bottom">
      <div className="w-full max-w-md bg-white rounded-3xl border-2 border-border p-8 shadow-lg text-center space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-indigo-50 border-2 border-indigo-100 text-primary flex items-center justify-center mx-auto shadow-sm">
          <FileQuestion className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Page Not Found
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The requested floor, table, or terminal view could not be found. Please check the URL.
          </p>
        </div>

        <div className="pt-2">
          <Link href="/">
            <Button variant="primary" size="lg" fullWidth className="font-bold shadow-sm">
              <Home className="w-5 h-5 mr-2" />
              <span>Return to POS Home</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

