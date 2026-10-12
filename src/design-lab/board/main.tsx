import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Board } from "@/design-lab/board/Board";
import "./lab.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Board />
  </StrictMode>
);
