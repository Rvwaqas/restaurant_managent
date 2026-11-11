import { spawn } from "child_process";

process.env.ANALYZE = "true";
const child = spawn("npx", ["next", "build"], { stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));

