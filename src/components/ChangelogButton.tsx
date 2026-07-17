import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { hasUnseen } from "@/lib/changelog";

/** "Story" button — opens the changelog, shows a dot when there's an unseen release. */
export function ChangelogButton() {
  const navigate = useNavigate();
  const [unseen] = useState(hasUnseen());
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      title="Story · обновления"
      aria-label={unseen ? "Story — обновления, есть новое" : "Story — обновления"}
      onClick={() => navigate("/changelog")}
    >
      <BookOpen className="h-4 w-4" />
      {unseen && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-success ring-2 ring-background" />}
    </Button>
  );
}
