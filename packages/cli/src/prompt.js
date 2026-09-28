import { createInterface } from "node:readline";

/**
 * Ask a question on the TTY. When `secret` is true the typed characters are
 * masked with "*".
 */
export function ask(question, { secret = false, input = process.stdin, output = process.stderr } = {}) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input, output, terminal: true });
    if (secret) {
      // Replace echoed characters with "*" while keeping the prompt visible.
      rl._writeToOutput = (chunk) => {
        if (chunk.includes(question)) output.write(chunk);
        else if (chunk === "\r\n" || chunk === "\n") output.write(chunk);
        else output.write("*".repeat([...chunk].length));
      };
    }
    rl.on("SIGINT", () => {
      rl.close();
      output.write("\n");
      const error = new Error("Cancelled.");
      error.cancelled = true;
      reject(error);
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
